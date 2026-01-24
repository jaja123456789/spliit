## ADDED Requirements

### Requirement: Centralized Group State Provider with Single react-query Pipeline

The system SHALL provide a React Context provider that manages all group state using a single react-query query with localStorage as placeholderData.

#### Scenario: Immediate render with localStorage via placeholderData

- **GIVEN** the GroupsProvider mounts on the client
- **WHEN** react-query initializes
- **THEN** placeholderData is set from localStorage synchronously
- **AND** UI can render immediately with local groups
- **AND** query status is 'pending' while queryFn runs in background

#### Scenario: Unauthenticated user completes with local data

- **GIVEN** the user is not authenticated
- **WHEN** queryFn executes
- **THEN** it returns local data with source='local-only'
- **AND** query status becomes 'success'
- **AND** no cloud fetch is attempted

#### Scenario: Authenticated user fetches and merges cloud data

- **GIVEN** the user is authenticated
- **WHEN** queryFn executes
- **THEN** it fetches sync.listGroups from server
- **AND** merges server groups with local (server wins conflicts)
- **AND** persists merged data to localStorage
- **AND** returns merged data with source='merged'
- **AND** query status becomes 'success'

#### Scenario: Cloud fetch failure returns local with error

- **GIVEN** the user is authenticated
- **AND** cloud fetch fails after retries
- **WHEN** queryFn handles the error
- **THEN** it returns local data with syncError attached
- **AND** query status becomes 'success' (not 'error')
- **AND** data is always available to consumers

#### Scenario: Provider handles corrupt localStorage data

- **GIVEN** localStorage contains invalid JSON or schema-invalid data
- **WHEN** placeholderData is read
- **THEN** the invalid key falls back to an empty array
- **AND** a warning is logged
- **AND** the application continues without error

#### Scenario: Provider returns empty state during SSR

- **GIVEN** the app is rendering on the server
- **WHEN** a component accesses group state
- **THEN** placeholderData returns empty arrays
- **AND** no localStorage access is attempted

### Requirement: react-query Stale Time and Auto-Refresh

The system SHALL use react-query with stale-time and refetchOnWindowFocus for cloud data freshness.

#### Scenario: Stale time prevents excessive fetches

- **GIVEN** cloud groups were fetched less than 5 minutes ago
- **WHEN** a component re-renders or mounts
- **THEN** react-query returns cached data without network request

#### Scenario: Refetch on window focus

- **GIVEN** the user has been on another tab
- **WHEN** they return to the Spliit tab
- **THEN** react-query refetches if data is stale (> 5 minutes)
- **AND** UI shows isRefetching=true during fetch

#### Scenario: Automatic retry on failure

- **GIVEN** the cloud fetch fails (network error)
- **WHEN** react-query handles the error
- **THEN** it retries up to 3 times with exponential backoff

### Requirement: Session Change Triggers Refetch

The system SHALL invalidate the groups query when session state changes.

#### Scenario: Sign-in triggers cloud fetch

- **GIVEN** user was unauthenticated
- **WHEN** they sign in (session becomes authenticated)
- **THEN** the groups query is invalidated
- **AND** queryFn re-runs with new session context
- **AND** cloud groups are fetched and merged

#### Scenario: Sign-out resets to local-only

- **GIVEN** user was authenticated with merged data
- **WHEN** they sign out (session becomes unauthenticated)
- **THEN** the groups query is invalidated
- **AND** queryFn re-runs returning local-only data

### Requirement: Read-Only Groups Hook

The system SHALL provide a `useGroups()` hook that returns current group state with react-query status.

#### Scenario: Hook returns data and query state

- **GIVEN** a component uses the useGroups hook
- **WHEN** the component renders
- **THEN** it receives recentGroups, starredGroupIds, archivedGroupIds, syncedGroupIds
- **AND** isPending, isSuccess, isRefetching from react-query
- **AND** syncError if cloud fetch failed

#### Scenario: Data always available via placeholderData

- **GIVEN** a component uses useGroups
- **WHEN** query is in any state (pending, success, error)
- **THEN** data is never undefined
- **AND** at minimum contains localStorage data

#### Scenario: Hook provides convenience methods

- **GIVEN** a component uses useGroups
- **WHEN** checking group status
- **THEN** isStarred(groupId), isArchived(groupId), isSynced(groupId) functions are available
- **AND** they return boolean results with O(1) lookup

#### Scenario: Components re-render on state changes

- **GIVEN** a component uses useGroups
- **WHEN** another component calls a group action
- **THEN** the reading component re-renders with updated cache

### Requirement: Group Actions with Optimistic Updates

The system SHALL provide a `useGroupActions()` hook with optimistic cache updates.

#### Scenario: Action updates cache optimistically

- **GIVEN** a user calls starGroup(groupId)
- **WHEN** the action executes
- **THEN** react-query cache is updated immediately (optimistic)
- **AND** localStorage is updated immediately
- **AND** UI reflects change without waiting for server

#### Scenario: Action syncs to server if authenticated and synced

- **GIVEN** an authenticated user with a synced group
- **WHEN** they call starGroup(groupId)
- **THEN** sync.updateMetadata is called to update server
- **AND** server failure does not revert local update

#### Scenario: Action skips server if not synced

- **GIVEN** a user with an unsynced group
- **WHEN** they call starGroup(groupId)
- **THEN** only cache and localStorage are updated
- **AND** no server call is made

### Requirement: Auto-Sync New Local Groups

The system SHALL automatically sync new local groups to cloud when syncNewGroups preference is enabled.

#### Scenario: Auto-sync on saveRecentGroup

- **GIVEN** an authenticated user with syncNewGroups enabled
- **AND** a group that is not already synced
- **WHEN** saveRecentGroup(group) is called
- **THEN** the group is added to local state and localStorage
- **AND** sync.addGroup is called to sync to cloud
- **AND** syncedGroupIds is updated on success

#### Scenario: Auto-sync skips already synced groups

- **GIVEN** an authenticated user with syncNewGroups enabled
- **AND** a group that is already synced
- **WHEN** saveRecentGroup(group) is called
- **THEN** local state is updated
- **AND** no sync.addGroup call is made (already synced)

#### Scenario: Auto-sync disabled

- **GIVEN** an authenticated user with syncNewGroups disabled
- **WHEN** saveRecentGroup(group) is called
- **THEN** only local state and localStorage are updated
- **AND** no cloud sync is attempted

#### Scenario: Auto-sync failure is silent

- **GIVEN** auto-sync conditions are met
- **WHEN** sync.addGroup fails
- **THEN** error is logged
- **AND** local update is preserved
- **AND** user is not interrupted

### Requirement: Manual Refresh

The system SHALL allow users to manually trigger a cloud refresh.

#### Scenario: Manual refresh invalidates query

- **GIVEN** an authenticated user
- **WHEN** they call refresh() action
- **THEN** queryClient.invalidateQueries is called
- **AND** queryFn re-runs fetching fresh cloud data

#### Scenario: Manual refresh shows loading state

- **GIVEN** user triggers manual refresh
- **WHEN** refetch is in progress
- **THEN** isRefetching is true
- **AND** UI can show sync indicator

### Requirement: Sync Indicator

The system SHALL display a subtle loading indicator when cloud sync is in progress.

#### Scenario: Show indicator during refetch

- **GIVEN** isRefetching is true
- **WHEN** the sync indicator component renders
- **THEN** it shows a subtle loading spinner with "Syncing..." text

#### Scenario: Hide indicator when not refetching

- **GIVEN** isRefetching is false
- **WHEN** the sync indicator component renders
- **THEN** it renders nothing

### Requirement: Context Error Handling

The system SHALL throw descriptive errors when hooks are used incorrectly.

#### Scenario: Hook used outside provider

- **GIVEN** a component calls useGroups or useGroupActions
- **WHEN** the component is not wrapped by GroupsProvider
- **THEN** an error is thrown with message indicating the missing provider

### Requirement: localStorage Backward Compatibility

The system SHALL maintain full backward compatibility with existing localStorage data format.

#### Scenario: Existing localStorage data loads correctly

- **GIVEN** a user has existing localStorage data from before the refactor
- **WHEN** they visit the app after the refactor is deployed
- **THEN** all their recentGroups, starredGroups, archivedGroups load correctly
- **AND** no data migration is required

#### Scenario: New data format matches old

- **GIVEN** the context persists data to localStorage
- **WHEN** the data is inspected
- **THEN** recentGroups is an array of {id: string, name: string}
- **AND** starredGroups is an array of strings (groupIds)
- **AND** archivedGroups is an array of strings (groupIds)
