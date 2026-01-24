# Change: Refactor Group State to Centralized Context

## Why

Group state (recentGroups, starredGroups, archivedGroups) is scattered across components with no reactive data layer. Current issues:

- `loadGroups()` is defined locally in `recent-group-list.tsx`, called via prop-drilled `refreshGroupsFromStorage` callbacks
- Direct localStorage access scattered across 7+ files with no cache invalidation
- `SyncRestoreProvider` is hacky and tightly coupled - handles cloud sync separately from local state
- Race condition: UI doesn't update after sync-restore completes
- No unified pipeline for loading local vs cloud groups
- New local groups are not auto-synced to cloud even when `syncNewGroups` is enabled

## What Changes

- **New**: `GroupsProvider` React Context with single react-query pipeline:
  - `placeholderData` = localStorage (immediate render)
  - `queryFn` = load local → merge cloud (for authenticated)
  - Single state machine: `isPending` / `isSuccess` / `isError`
- **New**: Bidirectional sync: local ↔ cloud (simple, automatic)
- **New**: Auto-sync new local groups to cloud when `syncNewGroups` preference enabled
- **New**: `useGroups()` hook for reactive state access
- **New**: `useGroupActions()` hook for mutations (optimistic updates + server sync)
- **New**: Subtle sync indicator during cloud fetch (`isRefetching`)
- **New**: Manual refresh button (triggers `queryClient.invalidateQueries`)
- **Removed**: `SyncRestoreProvider` - logic merged into `GroupsProvider`
- **Removed**: `src/lib/sync-restore.ts` - merge logic moves to context
- **Removed**: `src/app/groups/[groupId]/auto-sync-on-visit.tsx` - logic moves to `saveRecentGroup`
- **Removed**: `refreshGroupsFromStorage` prop drilling pattern
- **Removed**: Custom `loadingPhase` state machine (replaced by react-query states)
- **Simplified**: `useGroupSync` hook becomes thin wrapper around context
- **Modified**: All group state consumers use context hooks instead of direct localStorage
- **Preserved**: localStorage data format unchanged for backward compatibility

## Impact

- Affected specs: `group-state-management` (new), `group-sync-ui` (modified)
- Affected code:
  - `src/contexts/groups-context.tsx` (new) - GroupsProvider with react-query
  - `src/components/sync-indicator.tsx` (new) - Subtle loading indicator
  - `src/app/layout.tsx` - Replace SyncRestoreProvider with GroupsProvider
  - `src/app/groups/recent-group-list.tsx` - Use context, remove local state
  - `src/app/groups/recent-group-list-card.tsx` - Use context actions
  - `src/app/groups/add-group-by-url-button.tsx` - Use context actions
  - `src/app/groups/[groupId]/save-recent-group.tsx` - Use context actions
  - `src/app/groups/[groupId]/auto-sync-on-visit.tsx` - Use context
  - `src/app/groups/use-group-sync.tsx` - Delegate to context
  - `src/app/settings/components/sync-all-groups.tsx` - Use context
- Files removed:
  - `src/components/sync-restore-provider.tsx`
  - `src/lib/sync-restore.ts`
  - `src/app/groups/[groupId]/auto-sync-on-visit.tsx`

## Key Design Decisions

| Decision                               | Rationale                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Single react-query pipeline            | One state machine (isPending/isSuccess/isError) instead of custom loadingPhase |
| localStorage as `placeholderData`      | Immediate data on first render, seamless transition to cloud data              |
| NOT using react-query for localStorage | localStorage is sync; react-query is for async sources with caching            |
| Auto-sync new groups                   | Natural extension of `syncNewGroups` preference                                |
| Server wins merge                      | Simple, predictable, no conflict UI needed                                     |
| Bidirectional sync                     | Local → cloud on mutations, cloud → local on fetch                             |
| 5-minute staleTime                     | Balance freshness vs API calls                                                 |
| refetchOnWindowFocus                   | Auto-refresh when user returns to tab                                          |
| Optimistic cache updates               | Instant UI feedback, persist to localStorage, then server                      |

## Unified Loading Pipeline with Bidirectional Sync

```
┌─────────────────────────────────────────────────────────────────┐
│ react-query starts                                               │
│ • placeholderData = localStorage (sync, immediate)               │
│ • UI renders immediately with local groups                       │
│ • status: 'pending' (queryFn running in background)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ queryFn: loadGroupsPipeline(session)                             │
│                                                                  │
│ If unauthenticated:                                              │
│   └── Return local data → status: 'success'                      │
│                                                                  │
│ If authenticated (CLOUD → LOCAL):                                │
│   ├── Fetch sync.listGroups from server                          │
│   ├── Merge: server wins, local-only preserved                   │
│   ├── Persist merged data to localStorage                        │
│   └── Return merged data → status: 'success'                     │
│                                                                  │
│ On error:                                                        │
│   └── Return local + syncError → status: 'success'               │
│       (don't throw, so data always available)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Ongoing (LOCAL → CLOUD)                                          │
│ • Actions: optimistic cache → localStorage → server (if synced)  │
│ • Auto-sync: new groups synced if syncNewGroups enabled          │
│ • refetchOnWindowFocus: refresh when user returns                │
│ • Manual refresh: user triggers invalidateQueries                │
└─────────────────────────────────────────────────────────────────┘
```

## Consumer API

```typescript
function RecentGroupList() {
  const { recentGroups, isRefetching, syncError } = useGroups()

  // Data always available (placeholderData)
  // isRefetching = cloud sync in progress

  return (
    <>
      {isRefetching && <SyncIndicator />}
      <GroupList groups={recentGroups} />
    </>
  )
}

function RecentGroupListCard({ group }) {
  const { isStarred, isSynced } = useGroups()
  const { starGroup } = useGroupActions()

  // Direct action call, no refresh needed
  return (
    <Card onClick={() => starGroup(group.id)}>
      {isSynced(group.id) && <CloudIcon />}
    </Card>
  )
}
```

## Out of Scope (v1)

- Real-time cross-tab sync (can add `storage` event listener later)
- Complex conflict resolution UI
- Offline queue for pending syncs
- Server-side state (groups remain client-side until synced)
