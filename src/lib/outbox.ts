import { ExpenseFormValues } from '@/lib/schemas'
import { useMemo, useSyncExternalStore } from 'react'
import superjson from 'superjson'

/**
 * Expenses added without a network, waiting on this device to be sent.
 *
 * Kept in local storage with superjson, not JSON: the values carry a `Date`, which plain JSON
 * would hand back as a string. Each carries the id it will be created under, chosen here, so
 * sending one twice — a retry after a lost answer, two tabs at once — creates it once.
 */
export type OutboxItem = {
  /** The id the expense will have. */
  id: string
  groupId: string
  values: ExpenseFormValues
  participantId?: string
  queuedAt: string
  /** The server's refusal, when it gave one. Such an item is not retried; it can be discarded. */
  error?: string
}

const KEY = 'spliit-outbox'
const CHANGE_EVENT = 'spliit:outbox-change'
const EMPTY: OutboxItem[] = []

function parse(raw: string | null): OutboxItem[] {
  if (!raw) return EMPTY
  try {
    return superjson.parse<OutboxItem[]>(raw) ?? EMPTY
  } catch {
    return EMPTY
  }
}

export function readOutbox(groupId?: string): OutboxItem[] {
  if (typeof localStorage === 'undefined') return EMPTY
  const items = parse(localStorage.getItem(KEY))
  return groupId ? items.filter((item) => item.groupId === groupId) : items
}

function write(items: OutboxItem[]) {
  localStorage.setItem(KEY, superjson.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function enqueueExpense(item: Omit<OutboxItem, 'queuedAt'>) {
  write([...readOutbox(), { ...item, queuedAt: new Date().toISOString() }])
}

export function removeFromOutbox(id: string) {
  write(readOutbox().filter((item) => item.id !== id))
}

export function markOutboxError(id: string, error: string) {
  write(
    readOutbox().map((item) => (item.id === id ? { ...item, error } : item)),
  )
}

/** Calls back on any change to the outbox, in this tab or another. Returns the unsubscribe. */
export function onOutboxChange(callback: () => void) {
  const otherTab = (event: StorageEvent) => {
    if (event.key === KEY) callback()
  }
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', otherTab)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener('storage', otherTab)
  }
}

// `useSyncExternalStore` wants the same array back while nothing changed.
let lastRaw: string | null = null
let lastItems: OutboxItem[] = EMPTY
function snapshot() {
  const raw = localStorage.getItem(KEY)
  if (raw !== lastRaw) {
    lastRaw = raw
    lastItems = parse(raw)
  }
  return lastItems
}

/** This group's waiting expenses, kept current. Empty during the server render. */
export function useOutbox(groupId: string) {
  const items = useSyncExternalStore(onOutboxChange, snapshot, () => EMPTY)
  return useMemo(
    () => items.filter((item) => item.groupId === groupId),
    [items, groupId],
  )
}
