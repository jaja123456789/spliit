# Design: Centralized Group State Management

## Context

Spliit stores user's group references in localStorage across three keys: `recentGroups`, `starredGroups`, `archivedGroups`. Current implementation has:

- Helper functions in `recent-groups-helpers.ts` that read/write localStorage directly
- Components calling helpers and manually triggering UI refreshes via prop-drilled callbacks
- Separate `SyncRestoreProvider` that handles cloud sync on sign-in (tightly coupled, hacky)
- Race conditions where UI doesn't update after sync-restore completes
- Multiple workarounds due to lack of centralized state (see "Workarounds to Eliminate" section)

**Stakeholders**: All components displaying/modifying group lists
**Constraints**: Must preserve existing localStorage format for backward compatibility

## Goals / Non-Goals

**Goals:**

- Single source of truth for group state accessible via React hooks
- Unified react-query pipeline: localStorage as `placeholderData`, cloud merge for authenticated users
- **Bidirectional sync**: local ↔ cloud, simple and automatic
- Auto-sync new local groups to cloud when `syncNewGroups` preference enabled
- Single react-query state machine (`isPending`/`isSuccess`/`isError`) instead of custom `loadingPhase`
- Reactive UI updates when group state changes (no manual refresh calls)
- Eliminate `SyncRestoreProvider` and other workarounds
- Maintain 100% backward compatibility with existing localStorage data

**Non-Goals:**

- Real-time cross-tab synchronization (rely on `refetchOnWindowFocus` for now)
- Changing localStorage data format
- Complex conflict resolution UI (server wins, simple)
- Offline mutation queue (show toast on failure instead)
- Auto-repair corrupted localStorage (ignore invalid data, fallback to empty)

## Workarounds to Eliminate

The group-sync feature (commit `c8f3143`) introduced several workarounds due to lack of centralized state. This refactor will clean them up:

### 1. `useGroupSync` hook - Separate sync state management

**Current problem** (`src/app/groups/use-group-sync.tsx`):

```typescript
// Fetches synced groups separately, maintains local isSynced state
const { data: syncedGroups, refetch } = trpc.sync.listGroups.useQuery(...)
const [isSynced, setIsSynced] = useState(false)

useEffect(() => {
  if (syncedGroups) {
    const synced = syncedGroups.some(sg => sg.groupId === groupId)
    setIsSynced(synced)
  }
}, [syncedGroups, groupId])
```

**After refactor**: `syncedGroupIds` is part of unified `GroupsData`, hook becomes thin wrapper:

```typescript
function useGroupSync(groupId: string) {
  const { isSynced } = useGroups()
  const { syncGroup, unsyncGroup } = useGroupActions()
  return {
    isSynced: isSynced(groupId),
    toggleSync: () =>
      isSynced(groupId) ? unsyncGroup(groupId) : syncGroup(groupId),
  }
}
```

### 2. `AutoSyncOnVisit` component - Standalone sync trigger

**Current problem** (`src/app/groups/[groupId]/auto-sync-on-visit.tsx`):

```typescript
// Separate component that makes 3 queries just to decide if auto-sync should happen
const { data: preferences } = trpc.sync.getPreferences.useQuery(...)
const { data: omittedData } = trpc.sync.isOmitted.useQuery({ groupId }, ...)
const { data: syncedGroups } = trpc.sync.listGroups.useQuery(...)

useEffect(() => {
  // Complex conditions checking all 3 data sources
  if (!preferences?.syncNewGroups) return
  if (omittedData?.omitted) return
  if (syncedGroups?.some(...)) return
  // Then trigger addGroup mutation
}, [...])
```

**After refactor**: Auto-sync logic moves into `saveRecentGroup` action:

```typescript
// In GroupsProvider
const saveRecentGroup = async (group) => {
  // Update local state + localStorage
  updateCache(group)

  // Auto-sync if conditions met (all data already in context)
  if (session && preferences.syncNewGroups && !syncedGroupIds.has(group.id)) {
    await syncGroup(group.id)
  }
}
```

**Component becomes unnecessary** - delete `auto-sync-on-visit.tsx`

### 3. `SyncRestoreProvider` - Separate hydration logic

**Current problem** (`src/components/sync-restore-provider.tsx`):

```typescript
// Separate provider that runs on sign-in, writes directly to localStorage
// No coordination with RecentGroupList's local state
useEffect(() => {
  if (shouldRestore(isSignedIn)) {
    restoreFromServer(...)  // Writes to localStorage
    // UI doesn't know about this change!
  }
}, [session])
```

**After refactor**: Merged into GroupsProvider's react-query pipeline:

```typescript
// Session change invalidates query → refetch merges cloud data → UI updates reactively
useEffect(() => {
  if (sessionStatus !== 'loading') {
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  }
}, [sessionStatus])
```

### 4. `refreshGroupsFromStorage` prop drilling

**Current problem**: Every component needs to call `refreshGroupsFromStorage()` after mutations:

```typescript
// recent-group-list-card.tsx
const handleStar = () => {
  starGroup(group.id) // Direct localStorage write
  refreshGroupsFromStorage() // Manual UI refresh
}
```

**After refactor**: Actions update react-query cache → UI updates automatically:

```typescript
const handleStar = () => {
  starGroup(group.id) // Updates cache + localStorage + server
  // No manual refresh needed
}
```

### 5. Multiple `trpc.sync.listGroups` queries

**Current problem**: Same query made in multiple places:

- `useGroupSync` hook
- `AutoSyncOnVisit` component
- `sync-all-groups.tsx`
- `synced-groups-list.tsx`

**After refactor**: Single query in GroupsProvider, data accessed via `useGroups().syncedGroupIds`

## Decisions

### Architecture: Single react-query Pipeline

All group state (local + cloud) managed through one react-query query with bidirectional sync:

```typescript
// src/contexts/groups-context.tsx

interface GroupsData {
  recentGroups: RecentGroup[]
  starredGroupIds: Set<string>
  archivedGroupIds: Set<string>
  syncedGroupIds: Set<string>
  source: 'local-only' | 'merged'
  syncError?: Error
}

function GroupsProvider({ children }) {
  const { data: session, status: sessionStatus } = useSession()

  const groupsQuery = useQuery({
    queryKey: ['groups', session?.user?.id ?? 'anonymous'],
    queryFn: () => loadGroupsPipeline(session),
    enabled: sessionStatus !== 'loading',
    placeholderData: loadFromLocalStorage(), // Immediate local data
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  // ... actions and context value
}
```

**Why single pipeline:**

- `isPending` = loading (before any data)
- `isSuccess` = complete (local-only for unauth, merged for auth)
- `isError` = failed (but `placeholderData` still available)
- `data` = always available via `placeholderData`
- No custom state machine to manage

### localStorage as placeholderData (Not Separate Query)

**Why not use react-query for localStorage:**

- localStorage is synchronous, react-query is for async sources
- No benefit from cache invalidation, stale-time for localStorage
- Adds unnecessary abstraction

**Why use it as placeholderData:**

- Data available immediately on first render
- Seamless transition when cloud data arrives
- Single query to manage, not two

```typescript
const groupsQuery = useQuery({
  queryKey: ['groups', userId],
  queryFn: () => loadGroupsPipeline(session),
  placeholderData: loadFromLocalStorage(), // Sync read, immediate
})

// Consumer always has data
const { data } = groupsQuery // Never undefined due to placeholderData
```

### Safe localStorage Access

localStorage can fail (quota exceeded, private browsing, disabled). All access wrapped in try-catch with silent failure:

```typescript
function safeGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    console.warn(`localStorage.getItem('${key}') failed`)
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    console.warn(`localStorage.setItem('${key}') failed (quota exceeded?)`)
    // Silent fail - cache still has the data
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window === 'undefined') return
    localStorage.removeItem(key)
  } catch {
    console.warn(`localStorage.removeItem('${key}') failed`)
  }
}
```

**Behavior on localStorage failure:**

- Read failure → return empty data, app works with cache only
- Write failure → log warning, cache still updated (data persists until page refresh)
- No user-facing error (silent degradation)

### Unified Loading Pipeline

```typescript
async function loadGroupsPipeline(
  session: Session | null,
): Promise<GroupsData> {
  // 1. Always start with localStorage (immediate via placeholderData)
  const local = loadFromLocalStorage()

  // 2. If unauthenticated, return local-only
  if (!session?.user) {
    return { ...local, source: 'local-only' }
  }

  // 3. If authenticated, fetch cloud and merge
  try {
    const cloud = await trpcClient.sync.listGroups.query()
    const merged = mergeGroups(local, cloud)
    persistToLocalStorage(merged)
    return { ...merged, source: 'merged' }
  } catch (error) {
    // Cloud failed, return local with error attached
    console.error('Cloud sync failed:', error)
    return { ...local, source: 'local-only', syncError: error as Error }
  }
}
```

**Flow visualization:**

```
┌─────────────────────────────────────────────────────────────────┐
│ react-query starts                                               │
│ • placeholderData = localStorage (immediate)                     │
│ • UI renders with local groups                                   │
│ • status: 'pending' (fetching in background)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ queryFn executes                                                 │
│ • If unauthenticated: return local → status: 'success'           │
│ • If authenticated: fetch cloud, merge, persist                  │
│   └── Success: return merged → status: 'success'                 │
│   └── Failure: return local + syncError → status: 'success'      │
│       (we don't throw, so data is always available)              │
└─────────────────────────────────────────────────────────────────┘
```

### Bidirectional Sync

**Cloud → Local (on sign-in or refetch):**

- Query fetches `sync.listGroups`
- Merge with local (server wins conflicts)
- Persist merged data to localStorage
- UI updates via react-query cache

**Local → Cloud (on mutations):**

- Actions update cache + localStorage immediately (optimistic)
- If authenticated + group synced → update server via mutation
- If authenticated + `syncNewGroups` + new group → auto-sync to cloud

```typescript
// Example: starGroup action (bidirectional)
function starGroup(groupId: string) {
  // 1. Update react-query cache (immediate UI update)
  queryClient.setQueryData(queryKey, (old) => ({
    ...old,
    starredGroupIds: new Set([...old.starredGroupIds, groupId]),
  }))

  // 2. Persist to localStorage
  persistToLocalStorage(...)

  // 3. Sync to cloud if authenticated + synced
  if (session && syncedGroupIds.has(groupId)) {
    updateMetadataMutation.mutate({ groupId, isStarred: true })
  }
}
```

### Auto-Sync New Local Groups

When a group is added locally (via URL, creation, or visit), auto-sync if user has `syncNewGroups` enabled:

```typescript
const saveRecentGroup = useCallback(async (group: RecentGroup) => {
  // 1. Update cache + localStorage
  queryClient.setQueryData(queryKey, (old) => ({
    ...old,
    recentGroups: [group, ...old.recentGroups.filter(g => g.id !== group.id)],
  }))
  persistToLocalStorage(...)

  // 2. Auto-sync to cloud if conditions met
  if (session?.user && preferences?.syncNewGroups && !syncedGroupIds.has(group.id)) {
    try {
      await addGroupMutation.mutateAsync({
        groupId: group.id,
        isStarred: starredGroupIds.has(group.id),
        isArchived: archivedGroupIds.has(group.id),
      })
      // Update syncedGroupIds in cache
      queryClient.setQueryData(queryKey, (old) => ({
        ...old,
        syncedGroupIds: new Set([...old.syncedGroupIds, group.id]),
      }))
    } catch (error) {
      console.error('Auto-sync failed:', error)
      // Local update succeeded, cloud sync failed silently
    }
  }
}, [session, preferences, queryClient])
```

**When auto-sync triggers:**

- `saveRecentGroup()` called (visit group, add by URL, create group)
- User is authenticated
- `syncNewGroups` preference is enabled
- Group is not already synced

### Merge Logic (Server Wins)

```typescript
function mergeGroups(local: GroupsData, cloud: SyncedGroup[]): GroupsData {
  const merged: GroupsData = {
    recentGroups: [],
    starredGroupIds: new Set(),
    archivedGroupIds: new Set(),
    syncedGroupIds: new Set(),
    source: 'merged',
  }

  const processedIds = new Set<string>()

  // Server groups first (they win conflicts)
  for (const serverGroup of cloud) {
    merged.recentGroups.push({
      id: serverGroup.groupId,
      name: serverGroup.group.name,
    })
    if (serverGroup.isStarred) merged.starredGroupIds.add(serverGroup.groupId)
    if (serverGroup.isArchived) merged.archivedGroupIds.add(serverGroup.groupId)
    merged.syncedGroupIds.add(serverGroup.groupId)
    processedIds.add(serverGroup.groupId)
  }

  // Local-only groups preserved (not on server)
  for (const localGroup of local.recentGroups) {
    if (!processedIds.has(localGroup.id)) {
      merged.recentGroups.push(localGroup)
      if (local.starredGroupIds.has(localGroup.id)) {
        merged.starredGroupIds.add(localGroup.id)
      }
      if (local.archivedGroupIds.has(localGroup.id)) {
        merged.archivedGroupIds.add(localGroup.id)
      }
      // Not synced, so not added to syncedGroupIds
    }
  }

  return merged
}
```

### Provider Placement & Hierarchy

```
src/app/layout.tsx
└── TRPCProvider
    └── AuthProvider (SessionProvider)
        └── GroupsProvider          ← Replaces SyncRestoreProvider
            └── {children}
```

### Hook API Design

```typescript
// Read-only state access
function useGroups() {
  const { groupsQuery } = useGroupsContext()
  const data = groupsQuery.data! // Always available via placeholderData

  return {
    // Data (always available)
    recentGroups: data.recentGroups,
    starredGroupIds: data.starredGroupIds,
    archivedGroupIds: data.archivedGroupIds,
    syncedGroupIds: data.syncedGroupIds,

    // Query state
    isPending: groupsQuery.isPending,
    isSuccess: groupsQuery.isSuccess,
    isRefetching: groupsQuery.isRefetching,
    syncError: data.syncError,

    // Convenience methods
    isStarred: (groupId: string) => data.starredGroupIds.has(groupId),
    isArchived: (groupId: string) => data.archivedGroupIds.has(groupId),
    isSynced: (groupId: string) => data.syncedGroupIds.has(groupId),
  }
}

// Mutation actions
function useGroupActions() {
  const { actions } = useGroupsContext()
  return actions
}

interface GroupActions {
  // Recent groups (auto-syncs if syncNewGroups enabled)
  saveRecentGroup: (group: RecentGroup) => void
  deleteRecentGroup: (groupId: string) => void

  // Starred (updates local + server if synced, shows toast on failure)
  starGroup: (groupId: string) => void
  unstarGroup: (groupId: string) => void

  // Archived (updates local + server if synced, shows toast on failure)
  archiveGroup: (groupId: string) => void
  unarchiveGroup: (groupId: string) => void

  // Explicit sync operations
  syncGroup: (groupId: string) => Promise<void>
  unsyncGroup: (groupId: string) => Promise<void>
  syncAllGroups: () => Promise<{ synced: number; skipped: number }>

  // Manual refresh
  refresh: () => void

  // Logout support
  clearLocalData: () => void // Clears cache + localStorage
}
```

### Session Change Handling

When session changes (sign-in/sign-out), invalidate the query to refetch:

```typescript
useEffect(() => {
  if (
    sessionStatus === 'authenticated' ||
    sessionStatus === 'unauthenticated'
  ) {
    // Session state known, invalidate to refetch with new context
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  }
}, [sessionStatus, queryClient])
```

### Consumer Example

```typescript
function RecentGroupList() {
  const { recentGroups, isRefetching, syncError } = useGroups()

  // Data always available via placeholderData
  // isRefetching true when cloud sync in progress

  return (
    <GroupsPage>
      {isRefetching && <SyncIndicator />}
      {syncError && <SyncErrorBanner error={syncError} />}
      <GroupList groups={recentGroups} />
    </GroupsPage>
  )
}

function RecentGroupListCard({ group }: { group: RecentGroup }) {
  const { isStarred, isArchived, isSynced } = useGroups()
  const { starGroup, unstarGroup } = useGroupActions()

  // Direct action calls, no refresh needed
  const handleStar = () => {
    isStarred(group.id) ? unstarGroup(group.id) : starGroup(group.id)
  }

  return (
    <Card>
      <span>{group.name}</span>
      {isSynced(group.id) && <CloudIcon />}
      <StarButton filled={isStarred(group.id)} onClick={handleStar} />
    </Card>
  )
}
```

## Files to Remove

- `src/components/sync-restore-provider.tsx` - Logic moves to GroupsProvider
- `src/lib/sync-restore.ts` - Merge logic moves to GroupsProvider
- `src/app/groups/[groupId]/auto-sync-on-visit.tsx` - Logic moves to `saveRecentGroup` action

## Files to Create

- `src/contexts/groups-context.tsx` - GroupsProvider with react-query pipeline
- `src/contexts/index.ts` - Export hooks and provider
- `src/components/sync-indicator.tsx` - Subtle loading indicator

## Files to Modify

- `src/app/layout.tsx` - Replace SyncRestoreProvider with GroupsProvider
- `src/app/groups/recent-group-list.tsx` - Use context instead of local state
- `src/app/groups/recent-group-list-card.tsx` - Use context actions
- `src/app/groups/add-group-by-url-button.tsx` - Use context actions
- `src/app/groups/[groupId]/save-recent-group.tsx` - Use context actions
- `src/app/groups/[groupId]/layout.client.tsx` - Remove AutoSyncOnVisit component
- `src/app/groups/use-group-sync.tsx` - Simplify to thin wrapper around context
- `src/app/settings/components/sync-all-groups.tsx` - Use context
- `src/app/settings/components/synced-groups-list.tsx` - Use context

## Edge Cases

| Scenario                      | Behavior                                                |
| ----------------------------- | ------------------------------------------------------- |
| localStorage quota exceeded   | Silent fail - log warning, cache still updates          |
| localStorage unavailable      | Silent fail - app works with in-memory cache only       |
| Corrupt localStorage data     | Zod validation fails, fallback to empty arrays          |
| SSR/hydration                 | placeholderData returns empty, hydrates on client       |
| Cloud fetch fails             | syncError set, local data preserved, user can retry     |
| Session expires mid-use       | UNAUTHORIZED detected → redirect to login page          |
| Context used outside provider | Throw descriptive error                                 |
| Auto-sync fails               | Show toast, local update preserved                      |
| Offline mutation              | Local succeeds, server fails with toast notification    |
| Orphaned local groups         | Keep in list (group was synced but deleted on server)   |
| Cross-tab changes             | Sync on window focus via `refetchOnWindowFocus`         |
| Cross-tab logout              | Accept stale data until focus (edge case, acceptable)   |
| Logout clears data            | `clearLocalData()` action clears cache + localStorage   |
| User switches accounts        | Clear previous user's cache on logout                   |
| Preferences not loaded        | Wait for preferences before allowing auto-sync          |
| Omitted group visited         | Check isOmitted first - do NOT auto-sync omitted groups |
| User has >100 groups          | Ignore - unrealistic scenario for this app              |
| syncAll partial failure       | Let server handle - frontend accepts whatever syncs     |

### Detailed Edge Case Handling

#### Logout Flow

```typescript
interface GroupActions {
  // ... other actions
  clearLocalData: () => void // Clears cache + localStorage for logout
}

// In account-info.tsx
const handleLogout = async (clearLocalData: boolean) => {
  if (clearLocalData) {
    actions.clearLocalData() // Context action instead of direct localStorage
  }
  // Clear previous user's cache to prevent data leakage
  queryClient.removeQueries({ queryKey: ['groups'] })
  await signOut({ redirect: false })
}
```

#### Preferences & Auto-Sync Timing

```typescript
// Preferences fetched separately (not part of GroupsData)
const preferencesQuery = trpc.sync.getPreferences.useQuery(undefined, {
  enabled: !!session,
})

// Auto-sync in saveRecentGroup waits for preferences
const saveRecentGroup = async (group: RecentGroup) => {
  // 1. Always update local immediately
  updateCache(group)
  persistToLocalStorage(...)

  // 2. Auto-sync only if preferences loaded and enabled
  if (session && preferencesQuery.data?.syncNewGroups && !syncedGroupIds.has(group.id)) {
    // Check omitted list before syncing
    const isOmitted = await trpcClient.sync.isOmitted.query({ groupId: group.id })
    if (!isOmitted.omitted) {
      try {
        await addGroupMutation.mutateAsync({ groupId: group.id, ... })
      } catch (error) {
        toast({ title: 'Sync failed', description: 'Group saved locally', variant: 'destructive' })
      }
    }
  }
}
```

#### Offline Mutations with Toast & UNAUTHORIZED Redirect

```typescript
import { TRPCClientError } from '@trpc/client'

function starGroup(groupId: string) {
  // 1. Optimistic local update (always succeeds)
  updateCache(...)
  persistToLocalStorage(...)

  // 2. Server sync with error handling
  if (session && syncedGroupIds.has(groupId)) {
    updateMetadataMutation.mutate(
      { groupId, isStarred: true },
      {
        onError: (error) => {
          // Session expired - redirect to login
          if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
            router.push('/login')
            return
          }
          // Other errors - show toast
          toast({
            title: 'Sync failed',
            description: 'Changes saved locally but not synced to cloud',
            variant: 'destructive',
          })
        },
      }
    )
  }
}
```

#### Helper: Handle Sync Errors

```typescript
// Reusable error handler for all sync mutations
function handleSyncError(error: unknown, router: Router) {
  if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
    router.push('/login')
    return
  }
  toast({
    title: 'Sync failed',
    description: 'Changes saved locally but not synced to cloud',
    variant: 'destructive',
  })
}
```

#### Create Group - Also Save Locally

```typescript
// In create-group.tsx
const handleSubmit = async (groupFormValues, participantId) => {
  const { groupId } = await mutateAsync({ groupFormValues })

  // Save to recent groups immediately (in case navigation fails)
  actions.saveRecentGroup({ id: groupId, name: groupFormValues.name })

  router.push(`/groups/${groupId}`)
}
```

#### Session Change - Cache Cleanup

```typescript
useEffect(() => {
  if (sessionStatus === 'unauthenticated') {
    // User logged out - clear any previous user's cached data
    queryClient.removeQueries({ queryKey: ['groups'] })
  }
  if (sessionStatus !== 'loading') {
    // Refetch with new session context
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  }
}, [sessionStatus, queryClient])

## Testing Strategy

1. **Unit tests:**

   - Pipeline: local-only for unauth, merged for auth
   - Merge logic: server wins, local preserved
   - Bidirectional sync: local→cloud on mutations, cloud→local on fetch
   - Auto-sync: triggers when conditions met
   - placeholderData: immediate data availability

2. **Integration tests:**

   - Full flow: mount → local → auth → cloud → UI
   - Actions update cache + localStorage + server
   - Session change triggers refetch

3. **E2E tests:**
   - Existing tests pass unchanged
   - Sync indicator shows during refetch
   - Manual refresh works
   - Auto-sync on group creation/visit

## Risks / Trade-offs

| Risk                              | Mitigation                                        |
| --------------------------------- | ------------------------------------------------- |
| UI "jumps" when cloud data merges | Subtle indicator; fast merge                      |
| queryKey changes on session       | Intentional - refetch with new context            |
| Auto-sync failures silent         | Log errors; local update always succeeds          |
| Breaking existing patterns        | Gradual migration; keep helpers during transition |

## Migration Plan

1. **Phase 1: Create GroupsProvider**

   - Implement context with react-query pipeline
   - Add placeholderData for immediate local
   - Keep old helpers working

2. **Phase 2: Add to layout**

   - Replace SyncRestoreProvider with GroupsProvider
   - Verify no regressions

3. **Phase 3: Migrate components**

   - Update one component at a time
   - Remove refreshGroupsFromStorage props

4. **Phase 4: Cleanup**
   - Remove SyncRestoreProvider
   - Remove sync-restore.ts
   - Remove auto-sync-on-visit.tsx
   - Simplify use-group-sync.tsx
   - Remove unused helper exports

**Rollback**: Keep old helpers until all migrations complete. Can revert component by component.
```
