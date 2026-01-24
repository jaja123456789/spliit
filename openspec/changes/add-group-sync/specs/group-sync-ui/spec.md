# Capability: Group Sync UI

User interface for group sync authentication, preferences, status indicators, and bidirectional sync.

## ADDED Requirements

### Requirement: Settings Page

The system SHALL provide a settings page at `/settings` for managing group sync.

#### Scenario: Unauthenticated user visits settings

- **GIVEN** an unauthenticated user
- **WHEN** they visit the settings page
- **THEN** they see an email input field
- **AND** a "Send magic link" button
- **AND** explanatory text about the sync feature

#### Scenario: Sign-in only from settings

- **GIVEN** a user wanting to enable group sync
- **WHEN** they initiate sign-in
- **THEN** sign-in is only available from the /settings page
- **AND** after successful sign-in, user is redirected back to /settings

#### Scenario: Magic link sent state

- **GIVEN** a user who just requested a magic link
- **WHEN** the page updates
- **THEN** they see a confirmation message
- **AND** instructions to check their email (or .mail/ folder in dev)

#### Scenario: Authenticated user visits settings

- **GIVEN** an authenticated user
- **WHEN** they visit the settings page
- **THEN** they see their email address and logout button
- **AND** sync preference toggles
- **AND** a list of their synced groups with unsync buttons
- **AND** a "Sync all groups now" button

### Requirement: Sync Preferences UI

The system SHALL allow users to configure sync behavior from the settings page.

#### Scenario: Toggle sync existing groups

- **GIVEN** an authenticated user on settings
- **WHEN** they enable "Sync all existing groups"
- **THEN** the preference is saved
- **AND** on next login, all localStorage groups will be synced

#### Scenario: Toggle sync new groups

- **GIVEN** an authenticated user on settings
- **WHEN** they enable "Sync all future groups"
- **THEN** the preference is saved
- **AND** newly visited groups will be automatically synced

#### Scenario: Manual sync all now

- **GIVEN** an authenticated user with local recent groups
- **WHEN** they click "Sync all groups now"
- **THEN** all localStorage groups (recents, starred, archived) are synced
- **AND** progress is shown for large batches
- **AND** a success message shows the count synced

### Requirement: Settings Navigation

The system SHALL provide navigation to the settings page.

#### Scenario: Header navigation

- **GIVEN** any page in the application
- **WHEN** the user looks at the header
- **THEN** they see a settings icon/link that navigates to `/settings`

### Requirement: Sync Status Indicator

The system SHALL display sync status indicators on group cards.

#### Scenario: Synced group indicator

- **GIVEN** a logged-in user viewing a group that is synced
- **WHEN** the group card is displayed
- **THEN** it shows a cloud icon indicating synced status

#### Scenario: Unsynced group indicator

- **GIVEN** a logged-in user viewing a group that is not synced
- **WHEN** the group card is displayed
- **THEN** it shows no sync indicator or a subtle unsynced state

#### Scenario: Not logged in

- **GIVEN** a user who is not logged in
- **WHEN** viewing group cards
- **THEN** no sync indicators are shown

### Requirement: Sync Toggle on Groups

The system SHALL allow users to sync/unsync groups from the group cards.

#### Scenario: Sync a group

- **GIVEN** a logged-in user viewing an unsynced group
- **WHEN** they click the sync button on the group card
- **THEN** the group is synced with current starred/archived state
- **AND** the indicator updates to show synced status

#### Scenario: Unsync a group from card

- **GIVEN** a logged-in user viewing a synced group
- **WHEN** they click the unsync button on the group card
- **THEN** the SyncedGroup is deleted and hash added to omittedGroupIds
- **AND** the indicator updates to show unsynced status

### Requirement: Remove Synced Group Confirmation

The system SHALL prompt before removing a synced group from recent groups.

#### Scenario: Remove synced group from recents

- **GIVEN** a logged-in user with a group that is both in recents and synced
- **WHEN** they attempt to remove the group from recent groups
- **THEN** a confirmation dialog appears
- **AND** explains the group will still be accessible on other devices if kept synced

#### Scenario: User chooses to keep synced

- **GIVEN** the confirmation dialog is shown
- **WHEN** the user chooses "Keep synced"
- **THEN** the group is removed from local recent groups only
- **AND** remains synced (accessible on other devices, will reappear on next sign-in)

#### Scenario: User chooses to unsync

- **GIVEN** the confirmation dialog is shown
- **WHEN** the user chooses "Also unsync"
- **THEN** the group is removed from local recent groups
- **AND** the SyncedGroup record is deleted
- **AND** the group ID hash is added to omittedGroupIds

#### Scenario: Remove unsynced group

- **GIVEN** a logged-in user with a group only in recents (not synced)
- **WHEN** they remove the group from recent groups
- **THEN** no confirmation dialog appears
- **AND** the group is simply removed from localStorage

### Requirement: Auto-Sync on Group Visit

The system SHALL automatically sync groups on first visit when the user has enabled auto-sync.

#### Scenario: Auto-sync enabled, new group visited

- **GIVEN** an authenticated user with syncNewGroups enabled
- **WHEN** they visit a group URL for the first time (not in localStorage)
- **AND** the group has no removedAt flag for this user
- **THEN** the group is automatically synced with current state

#### Scenario: Auto-sync respects omit list

- **GIVEN** an authenticated user with syncNewGroups enabled
- **WHEN** they visit a group whose hash is in omittedGroupIds
- **THEN** the group is NOT automatically re-synced

#### Scenario: Auto-sync disabled

- **GIVEN** an authenticated user with syncNewGroups disabled
- **WHEN** they visit a new group
- **THEN** the group is NOT automatically synced

#### Scenario: Auto-sync on group creation

- **GIVEN** an authenticated user with syncNewGroups enabled
- **WHEN** they create a new group and save succeeds
- **THEN** the group is automatically synced

### Requirement: Hydration on Sign-In

The system SHALL hydrate localStorage from server on sign-in, merging with local groups.

#### Scenario: Sign-in hydrates localStorage

- **GIVEN** a user signing in (new device or returning)
- **WHEN** authentication completes
- **THEN** the system captures current localStorage groups BEFORE fetching
- **AND** fetches all synced groups from server
- **AND** merges server groups with local groups (server wins for conflicts)
- **AND** populates localStorage recentGroups, starredGroups, archivedGroups

#### Scenario: Merge conflict resolution

- **GIVEN** a group exists both locally and on server
- **WHEN** hydration merges them
- **THEN** server data takes precedence (activeParticipantId, isStarred, isArchived)

#### Scenario: Local-only groups preserved

- **GIVEN** a user with local groups not on server
- **WHEN** they sign in
- **THEN** those groups remain in localStorage alongside synced groups
- **AND** they are NOT automatically synced unless syncExisting is enabled

#### Scenario: Sync existing on sign-in

- **GIVEN** a user with syncExisting enabled
- **WHEN** they sign in
- **THEN** all local groups (pre-existing + newly hydrated) are synced to server
- **AND** soft-deleted groups are NOT re-synced

#### Scenario: Hydration failure recovery

- **GIVEN** a network error during hydration fetch
- **WHEN** the fetch fails
- **THEN** the system retries up to 3 times with exponential backoff
- **AND** if all retries fail, shows error message and keeps local groups intact
- **AND** sets a "hydration pending" flag for retry on next page load

### Requirement: Starred and Archived Sync

The system SHALL sync starred and archived group status.

#### Scenario: Star a synced group

- **GIVEN** a logged-in user with a synced group
- **WHEN** they star the group
- **THEN** isStarred is updated on the server
- **AND** change reflects on other devices after refresh

#### Scenario: Archive a synced group

- **GIVEN** a logged-in user with a synced group
- **WHEN** they archive the group
- **THEN** isArchived is updated on the server
- **AND** change reflects on other devices after refresh

#### Scenario: Unstar/unarchive a synced group

- **GIVEN** a logged-in user with a starred/archived synced group
- **WHEN** they unstar/unarchive the group
- **THEN** the flag is cleared on the server

### Requirement: Sync Error Handling

The system SHALL handle sync errors gracefully and inform the user.

#### Scenario: Network error during sync

- **GIVEN** a logged-in user attempting to sync a group
- **WHEN** the network request fails
- **THEN** the system shows an error message
- **AND** the group remains unsynced locally
- **AND** user can retry the sync

#### Scenario: Partial bulk sync failure

- **GIVEN** a user syncing multiple groups via "Sync all"
- **WHEN** some groups fail to sync
- **THEN** the system reports which groups succeeded and which failed
- **AND** provides option to retry failed groups

#### Scenario: Storage quota exceeded

- **GIVEN** localStorage is near capacity
- **WHEN** hydration or sync attempts to write data
- **THEN** the system catches the QuotaExceededError
- **AND** shows error message suggesting to unsync some groups
- **AND** server-side sync state is NOT affected

#### Scenario: Session expired during sync

- **GIVEN** a user's session expires while using the app
- **WHEN** they attempt a sync operation
- **THEN** the system detects the auth error
- **AND** prompts user to sign in again
- **AND** clears stale sync UI indicators

### Requirement: Active Participant Sync

The system SHALL sync the user's selected active participant per group.

#### Scenario: Set active participant on synced group

- **GIVEN** a logged-in user viewing a synced group
- **WHEN** they select an active participant
- **THEN** activeParticipantId is updated on the server
- **AND** selection reflects on other devices after refresh

#### Scenario: Participant deleted

- **GIVEN** a synced group with activeParticipantId set
- **WHEN** that participant is deleted from the group
- **THEN** activeParticipantId is set to null (FK cascade)
- **AND** user must re-select a participant
