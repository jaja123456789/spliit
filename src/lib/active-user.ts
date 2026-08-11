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

/** Pass `null` to record that no participant is selected. */
export function writeActiveUser(groupId: string, participantId: string | null) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    activeUserStorageKey(groupId),
    participantId ?? NO_ACTIVE_USER,
  )
}

/** Whether a choice has been recorded at all, including an explicit "nobody". */
export function hasActiveUserChoice(groupId: string): boolean {
  if (typeof localStorage === 'undefined') return false
  return (
    localStorage.getItem(activeUserStorageKey(groupId)) !== null ||
    localStorage.getItem(NEW_GROUP_ACTIVE_USER_KEY) !== null
  )
}
