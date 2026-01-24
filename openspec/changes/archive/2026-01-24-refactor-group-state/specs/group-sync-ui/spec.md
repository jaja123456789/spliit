## MODIFIED Requirements

### Requirement: Hydration on Sign-In

The system SHALL automatically fetch and merge cloud groups when user signs in, using the centralized GroupsProvider with react-query.

#### Scenario: Sign-in triggers query invalidation

- **GIVEN** user was unauthenticated
- **WHEN** they sign in (session becomes authenticated)
- **THEN** GroupsProvider detects session change
- **AND** invalidates the groups query
- **AND** queryFn re-runs with authenticated session

#### Scenario: Cloud fetch and merge on sign-in

- **GIVEN** groups query is invalidated after sign-in
- **WHEN** queryFn executes
- **THEN** it fetches sync.listGroups from server
- **AND** merges server groups with local (server wins conflicts)
- **AND** persists merged data to localStorage
- **AND** UI updates reactively via cache subscription

#### Scenario: Local-only groups preserved after sign-in

- **GIVEN** user has local groups not on server
- **WHEN** cloud merge completes
- **THEN** those groups remain in state alongside synced groups
- **AND** they are candidates for auto-sync if syncNewGroups enabled

#### Scenario: Cloud fetch failure on sign-in

- **GIVEN** cloud fetch fails after retries
- **WHEN** queryFn handles the error
- **THEN** local groups remain available
- **AND** syncError is set in data
- **AND** user can manually retry via refresh

### Requirement: Starred and Archived Sync

The system SHALL sync starred and archived group status using optimistic cache updates.

#### Scenario: Star a synced group

- **GIVEN** a logged-in user with a synced group
- **WHEN** they call useGroupActions().starGroup(groupId)
- **THEN** react-query cache updates immediately (optimistic)
- **AND** localStorage is updated
- **AND** sync.updateMetadata is called to update server
- **AND** UI reflects change instantly

#### Scenario: Archive a synced group

- **GIVEN** a logged-in user with a synced group
- **WHEN** they call useGroupActions().archiveGroup(groupId)
- **THEN** react-query cache updates immediately (optimistic)
- **AND** localStorage is updated
- **AND** sync.updateMetadata is called to update server

#### Scenario: Star/archive unsynced group (local only)

- **GIVEN** a user with an unsynced group
- **WHEN** they star or archive the group via context actions
- **THEN** only cache and localStorage are updated
- **AND** no server call is made

### Requirement: Sync Preferences UI

The system SHALL allow users to configure sync behavior from the settings page, using context for group data.

#### Scenario: Toggle sync new groups

- **GIVEN** an authenticated user on settings
- **WHEN** they enable "Sync all future groups"
- **THEN** the preference is saved to server
- **AND** future saveRecentGroup calls will auto-sync

#### Scenario: Manual sync all now

- **GIVEN** an authenticated user with local recent groups
- **WHEN** they click "Sync all groups now"
- **THEN** useGroupActions().syncAllGroups() is called
- **AND** all groups from context are synced with their starred/archived state
- **AND** a success message shows the count synced

### Requirement: Auto-Sync New Groups on Visit/Create

The system SHALL automatically sync new groups to cloud when syncNewGroups preference is enabled.

#### Scenario: Auto-sync on group visit

- **GIVEN** an authenticated user with syncNewGroups enabled
- **WHEN** they visit a group (saveRecentGroup called)
- **AND** the group is not already synced
- **THEN** the group is automatically synced to cloud

#### Scenario: Auto-sync on group creation

- **GIVEN** an authenticated user with syncNewGroups enabled
- **WHEN** they create a new group (saveRecentGroup called)
- **THEN** the group is automatically synced to cloud

#### Scenario: Auto-sync respects omit list

- **GIVEN** an authenticated user with syncNewGroups enabled
- **WHEN** saveRecentGroup is called for a previously unsynced group
- **AND** the group hash is in omittedGroupIds
- **THEN** the group is NOT automatically synced

### Requirement: Auto-Refresh on Window Focus

The system SHALL automatically refresh cloud groups when user returns to the app.

#### Scenario: Refetch on window focus when stale

- **GIVEN** an authenticated user who switched to another tab
- **AND** data is stale (> 5 minutes old)
- **WHEN** they return to the Spliit tab
- **THEN** react-query refetches sync.listGroups
- **AND** merges fresh data with current state
- **AND** isRefetching is true during fetch

#### Scenario: No refetch when data is fresh

- **GIVEN** data was fetched less than 5 minutes ago
- **WHEN** user returns to tab
- **THEN** no network request is made
- **AND** cached data is returned

### Requirement: Manual Refresh Control

The system SHALL allow users to manually trigger a cloud refresh.

#### Scenario: Manual refresh via button

- **GIVEN** an authenticated user viewing their groups
- **WHEN** they click the refresh button
- **THEN** useGroupActions().refresh() is called
- **AND** query is invalidated and refetched
- **AND** isRefetching shows loading state

## REMOVED Requirements

### Requirement: SyncRestoreProvider

**Reason**: Logic merged into GroupsProvider's single react-query pipeline.

**Migration**: All sync-restore functionality (cloud fetch, merge, localStorage persist) is now handled by GroupsProvider's queryFn with placeholderData for immediate local data.
