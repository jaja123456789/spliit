/**
 * Which participant "you" are, within a group.
 *
 * This used to be a bare string in local storage compared against the literal `'None'` in a dozen
 * places, and written from three. The spellings drifted: the identity modal seeded its state as
 * `'None'` but rendered its radio as `value="none"`, so choosing a participant and then switching
 * back to "nobody" stored a lowercase `'none'` that passed every `!== 'None'` guard and was then
 * treated as a participant id — leaving the expense form with an unselectable payer that silently
 * refused to save. The group form, separately, stored the *translated* "None" label, so the same
 * comparison failed in every locale but English.
 *
 * Everything therefore goes through here. `readActiveUser` is deliberately forgiving: any value it
 * does not recognise as a real selection collapses to `null`, so a stale or mis-spelled entry
 * degrades to "nobody selected" instead of poisoning a form.
 */

export const NO_ACTIVE_USER = 'None'

/** Key holding the choice for a saved group. */
export const activeUserStorageKey = (groupId: string) => `${groupId}-activeUser`

/**
 * Key holding the choice made while *creating* a group, before its participants have ids. It
 * stores a participant name, and is exchanged for an id on the first visit to the group.
 */
export const NEW_GROUP_ACTIVE_USER_KEY = 'newGroup-activeUser'

const isNoneSentinel = (value: string) =>
  value.trim().toLowerCase() === NO_ACTIVE_USER.toLowerCase()

/**
 * @returns the stored participant id, or `null` when nobody is selected — which also covers an
 * unset key, an empty value, and any casing of the "none" sentinel.
 */
export function readActiveUser(groupId: string): string | null {
  if (typeof localStorage === 'undefined') return null
  const stored = localStorage.getItem(activeUserStorageKey(groupId))
  if (!stored || isNoneSentinel(stored)) return null
  return stored
}

const CHANGE_EVENT = 'spliit:active-user-change'

/** Pass `null` to record that no participant is selected. */
export function writeActiveUser(groupId: string, participantId: string | null) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    activeUserStorageKey(groupId),
    participantId ?? NO_ACTIVE_USER,
  )
  // Storage events only reach *other* tabs; this one hears about its own writes through this.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: groupId }))
}

/**
 * Calls back with the group's id whenever "who you are" there changes: chosen in the identity
 * modal, filled in from the account, or changed in another tab. Returns the unsubscribe.
 *
 * Readers used to take the value once, on mount, so choosing yourself in the modal left the list
 * showing no share of yours until the page was loaded again.
 */
export function onActiveUserChange(callback: (groupId: string) => void) {
  const suffix = activeUserStorageKey('')
  const own = (event: Event) => callback((event as CustomEvent<string>).detail)
  const otherTab = (event: StorageEvent) => {
    if (event.key?.endsWith(suffix))
      callback(event.key.slice(0, -suffix.length))
  }
  window.addEventListener(CHANGE_EVENT, own)
  window.addEventListener('storage', otherTab)
  return () => {
    window.removeEventListener(CHANGE_EVENT, own)
    window.removeEventListener('storage', otherTab)
  }
}

/**
 * Takes the account's answer for a group this device has never answered for. An answer given on
 * this device — "nobody" included — is never overwritten: it is the more specific of the two.
 */
export function seedActiveUser(groupId: string, participantId: string) {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(activeUserStorageKey(groupId)) !== null) return
  writeActiveUser(groupId, participantId)
}

/**
 * Forgets "who you are" in a group when that participant is no longer in it — removed in the group
 * settings, here or on another device. The stored id used to stay: comments and payments were then
 * sent as somebody the server no longer knew and failed with nothing on screen, the balances header
 * said "all settled", and the identity question was never asked again because it counted as
 * answered. Forgotten, it is asked again.
 *
 * @returns whether anything was forgotten.
 */
export function forgetActiveUserIfGone(
  groupId: string,
  participantIds: string[],
): boolean {
  const current = readActiveUser(groupId)
  if (!current || participantIds.includes(current)) return false
  localStorage.removeItem(activeUserStorageKey(groupId))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: groupId }))
  return true
}

/** Whether a choice has been recorded at all, including an explicit "nobody". */
export function hasActiveUserChoice(groupId: string): boolean {
  if (typeof localStorage === 'undefined') return false
  return (
    localStorage.getItem(activeUserStorageKey(groupId)) !== null ||
    localStorage.getItem(NEW_GROUP_ACTIVE_USER_KEY) !== null
  )
}
