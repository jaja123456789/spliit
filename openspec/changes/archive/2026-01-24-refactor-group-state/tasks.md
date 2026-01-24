# Tasks: Refactor Group State to Centralized Context

## 1. Create Groups Context Infrastructure

- [x] 1.1 Create `src/contexts/groups-context.tsx` with:
  - `GroupsData` interface (recentGroups, starredGroupIds, archivedGroupIds, syncedGroupIds, source, syncError)
  - `GroupsContextValue` interface (groupsQuery, actions)
  - `GroupActions` interface
  - `GroupsProvider` component
  - Internal `useGroupsContext` hook with error boundary
- [x] 1.2 Implement safe localStorage wrappers:
  - `safeGetItem(key)` - try-catch, return null on failure
  - `safeSetItem(key, value)` - try-catch, silent fail on quota exceeded
  - `safeRemoveItem(key)` - try-catch, silent fail
  - Log warnings on failure (no user-facing errors)
- [x] 1.3 Implement `loadFromLocalStorage()` helper:
  - Use safe wrappers for all localStorage access
  - Read recentGroups, starredGroups, archivedGroups from localStorage
  - Validate with Zod schemas (fallback to empty on error)
  - Convert to GroupsData format with Sets for O(1) lookup
- [x] 1.4 Implement `loadGroupsPipeline(session)` queryFn:
  - If unauthenticated: return local data with source='local-only'
  - If authenticated: fetch sync.listGroups, merge, persist, return with source='merged'
  - On error: return local data with syncError (don't throw)
- [x] 1.5 Implement react-query setup in GroupsProvider:
  - queryKey: `['groups', session?.user?.id ?? 'anonymous']`
  - placeholderData: `loadFromLocalStorage()`
  - staleTime: 5 minutes
  - refetchOnWindowFocus: true
  - enabled: `sessionStatus !== 'loading'`
- [x] 1.6 Implement session change effect:
  - Watch sessionStatus changes
  - On logout (unauthenticated): remove previous user's cache queries
  - Invalidate query when session becomes authenticated/unauthenticated
- [x] 1.7 Implement `useGroups()` hook:
  - Return data (always available via placeholderData)
  - Return isPending, isSuccess, isRefetching, syncError
  - Return convenience methods: isStarred, isArchived, isSynced
- [x] 1.8 Implement `useGroupActions()` hook
- [x] 1.9 Export hooks and provider from `src/contexts/index.ts`

## 2. Implement Merge Logic

- [x] 2.1 Create `mergeGroups(local, cloud)` function:
  - Server groups first (they win conflicts)
  - Local-only groups preserved
  - Return merged GroupsData with syncedGroupIds populated
- [x] 2.2 Create `persistToLocalStorage(data)` helper:
  - Use safe wrappers for all localStorage writes
  - Write recentGroups as array of {id, name}
  - Write starredGroups as array of strings
  - Write archivedGroups as array of strings
- [x] 2.3 Create `handleSyncError(error, router)` helper:
  - If UNAUTHORIZED: redirect to /login
  - Otherwise: show toast "Changes saved locally but not synced"
- [x] 2.4 Add unit tests for merge logic

## 3. Implement Group Actions with Bidirectional Sync

- [x] 3.1 `saveRecentGroup(group)`:
  - Update cache optimistically via queryClient.setQueryData
  - Persist to localStorage (using safe wrappers)
  - If authenticated + preferences loaded + syncNewGroups + not synced:
    - Check isOmitted FIRST - do NOT auto-sync omitted groups
    - If not omitted: auto-sync to cloud
    - On UNAUTHORIZED: redirect to /login
    - On other failure: show toast, local update preserved
- [x] 3.2 `deleteRecentGroup(groupId)`:
  - Update cache optimistically
  - Persist to localStorage
- [x] 3.3 `starGroup(groupId)`:
  - Update cache: add to starred, remove from archived
  - Persist to localStorage (using safe wrappers)
  - If authenticated + synced → call sync.updateMetadata (bidirectional)
  - On UNAUTHORIZED: redirect to /login
  - On other failure: show toast, local update preserved
- [x] 3.4 `unstarGroup(groupId)`:
  - Update cache: remove from starred
  - Persist to localStorage (using safe wrappers)
  - If authenticated + synced → call sync.updateMetadata
  - Use handleSyncError for error handling
- [x] 3.5 `archiveGroup(groupId)`:
  - Update cache: add to archived, remove from starred
  - Persist to localStorage (using safe wrappers)
  - If authenticated + synced → call sync.updateMetadata
  - Use handleSyncError for error handling
- [x] 3.6 `unarchiveGroup(groupId)`:
  - Update cache: remove from archived
  - Persist to localStorage (using safe wrappers)
  - If authenticated + synced → call sync.updateMetadata
  - Use handleSyncError for error handling
- [x] 3.7 `syncGroup(groupId)`:
  - Call sync.addGroup with current starred/archived state
  - Update cache: add to syncedGroupIds
  - Use handleSyncError for error handling
- [x] 3.8 `unsyncGroup(groupId)`:
  - Call sync.removeGroup
  - Update cache: remove from syncedGroupIds
  - Use handleSyncError for error handling
- [x] 3.9 `syncAllGroups()`:
  - Call sync.syncAll with all recentGroups
  - Return { synced, skipped }
  - Use handleSyncError for error handling
- [x] 3.10 `refresh()`:
  - Call queryClient.invalidateQueries for groups query
- [x] 3.11 `clearLocalData()`:
  - Clear localStorage using safe wrappers (recentGroups, starredGroups, archivedGroups)
  - Clear react-query cache for groups
  - Used by logout flow

## 4. Add Provider to App Layout

- [x] 4.1 Import GroupsProvider in `src/app/layout.tsx`
- [x] 4.2 Replace SyncRestoreProvider with GroupsProvider in provider hierarchy
- [x] 4.3 Verify SSR doesn't break (placeholderData returns empty on server)

## 5. Create Sync Indicator Component

- [x] 5.1 Create `src/components/sync-indicator.tsx`:
  - Show when isRefetching=true
  - Subtle Loader2 icon with "Syncing..." text
- [x] 5.2 Add SyncIndicator to RecentGroupList

## 6. Migrate Recent Group List

- [x] 6.1 Update `src/app/groups/recent-group-list.tsx`:
  - Remove local state (useState for RecentGroupsState)
  - Remove loadGroups() function
  - Remove useEffect that calls loadGroups
  - Use `useGroups()` for all state
  - Remove refreshGroupsFromStorage prop passing
- [x] 6.2 Update `RecentGroupList_` component:
  - Use context for groups, starred, archived
  - Remove refreshGroupsFromStorage parameter
  - Add SyncIndicator when isRefetching
- [x] 6.3 Update `GroupList` component:
  - Remove refreshGroupsFromStorage prop
- [x] 6.4 Update `GroupsPage` component:
  - Remove reload prop
  - Add manual refresh button

## 7. Migrate Recent Group List Card

- [x] 7.1 Update `src/app/groups/recent-group-list-card.tsx`:
  - Remove refreshGroupsFromStorage prop
  - Use `useGroups()` for isStarred, isArchived, isSynced
  - Use `useGroupActions()` for star/archive/delete
- [x] 7.2 Remove all refreshGroupsFromStorage() calls
- [x] 7.3 Update sync toggle to use syncGroup/unsyncGroup from context
- [x] 7.4 Remove useGroupSync hook usage (now handled by context)

## 8. Migrate Other Consumers

- [x] 8.1 Update `src/app/groups/add-group-by-url-button.tsx`:
  - Remove reload prop
  - Use `useGroupActions().saveRecentGroup()`
- [x] 8.2 Update `src/app/groups/[groupId]/save-recent-group.tsx`:
  - Use `useGroupActions().saveRecentGroup()`
- [x] 8.3 Update `src/app/settings/components/sync-all-groups.tsx`:
  - Use `useGroups()` for reading group lists
  - Use `useGroupActions().syncAllGroups()`
- [x] 8.4 Update `src/app/settings/components/synced-groups-list.tsx`:
  - Use `useGroups().syncedGroupIds` instead of separate query
- [x] 8.5 Update `src/app/groups/[groupId]/layout.client.tsx`:
  - Remove AutoSyncOnVisit component usage
- [x] 8.6 Update `src/app/settings/components/account-info.tsx`:
  - Use `useGroupActions().clearLocalData()` instead of direct localStorage.removeItem
- [x] 8.7 Update `src/app/groups/create/create-group.tsx`:
  - Call `saveRecentGroup()` after group creation (before navigation)
  - Remove separate auto-sync logic (now handled by saveRecentGroup)

## 9. Simplify useGroupSync Hook

- [x] 9.1 Update `src/app/groups/use-group-sync.tsx`:
  - Remove separate trpc.sync.listGroups query
  - Remove local isSynced state
  - Use `useGroups().isSynced()` from context
  - Use `useGroupActions().syncGroup/unsyncGroup` for toggleSync
  - Keep only thin wrapper logic (toast, loading state)

## 10. Remove Old Files & Workarounds

- [x] 10.1 Delete `src/components/sync-restore-provider.tsx`
- [x] 10.2 Delete `src/lib/sync-restore.ts`
- [x] 10.3 Delete `src/app/groups/[groupId]/auto-sync-on-visit.tsx`
- [x] 10.4 Update any remaining imports referencing deleted files

## 11. Cleanup Helper Functions

- [x] 11.1 Keep Zod schemas exported from recent-groups-helpers.ts
- [x] 11.2 Keep types exported (RecentGroup, RecentGroups)
- [x] 11.3 Remove or internalize save/delete/star/archive helper functions
- [x] 11.4 Update any remaining direct localStorage access

## 12. Add Manual Refresh UI

- [x] 12.1 Add refresh button to group list header or settings
- [x] 12.2 Button calls `useGroupActions().refresh()`
- [x] 12.3 Button disabled while isRefetching=true

## 13. Add Toast Notifications for Sync Failures

- [x] 13.1 Add toast hook/context access to GroupsProvider
- [x] 13.2 Show toast on auto-sync failure in saveRecentGroup
- [x] 13.3 Show toast on metadata sync failure (star/archive actions)
- [x] 13.4 Show toast on explicit sync/unsync failure

## 14. Testing

- [x] 14.1 Unit tests for GroupsProvider:
  - placeholderData returns localStorage immediately
  - queryFn: local-only for unauth, merged for auth
  - queryFn: returns local + syncError on cloud failure
  - Session change invalidates query
  - Logout clears previous user's cache
- [x] 14.2 Unit tests for merge logic:
  - Server wins conflicts
  - Local-only preserved (orphaned groups kept)
  - syncedGroupIds populated correctly
- [x] 14.3 Unit tests for actions:
  - Optimistic cache update
  - localStorage persistence
  - Bidirectional sync: local → cloud when authenticated + synced
  - Auto-sync on saveRecentGroup when syncNewGroups enabled
  - clearLocalData clears cache + localStorage
- [x] 14.4 Unit tests for hooks:
  - useGroups returns data (never undefined)
  - useGroupActions returns stable references
  - Context throws outside provider
- [x] 14.5 Integration tests:
  - Full flow: mount → local → auth → cloud → UI
  - Sign-in triggers refetch and merge
  - Actions update UI reactively
  - Toast shown on sync failure
- [x] 14.6 E2E tests:
  - Existing group flow tests pass
  - Sync indicator shows during refetch
  - Manual refresh works
  - Auto-sync on group creation (via saveRecentGroup)
  - Logout with clear data works correctly

## 15. Documentation

- [x] 15.1 Add JSDoc comments to context and hooks
- [x] 15.2 Update AGENTS.md with new pattern for group state access

## Dependencies

- Task 1 must complete before tasks 4-13
- Task 2 must complete before Task 1.3
- Task 3 depends on Task 1
- Task 4 must complete before tasks 6-12
- Tasks 6-9 can be done in parallel
- Task 10 depends on tasks 6-9 (all consumers migrated)
- Task 11 depends on tasks 6-10
- Task 13 depends on Task 3 (actions must support toast)
- Task 14 can start after Task 1, expanded after each migration

## Verification

- [x] TypeScript compilation passes (`npm run check-types`)
- [x] All unit tests pass (`npm test`)
- [ ] E2E tests pass (`npm run test-e2e`)
- [x] Production build succeeds (`npm run build`)
- [x] Manual verification:
  - Groups render immediately from localStorage
  - Authenticated users see cloud data after brief sync
  - Sync indicator shows during cloud fetch
  - Actions update UI instantly (optimistic)
  - Bidirectional sync: local changes sync to cloud, cloud changes appear locally
  - Manual refresh triggers refetch
  - Auto-sync works when syncNewGroups enabled
  - Sign-in/sign-out triggers appropriate refetch
  - AutoSyncOnVisit component no longer needed (logic in saveRecentGroup)
