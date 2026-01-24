# Capability: Group Sync Storage

Backend storage and API for syncing group references, starred/archived status, and metadata across devices.

## ADDED Requirements

### Requirement: Synced Groups Storage

The system SHALL store group sync relationships with metadata and starred/archived flags.

#### Scenario: Sync relationship structure

- **GIVEN** a user syncs a group
- **WHEN** the system stores the relationship
- **THEN** it includes visitorId, groupId, activeParticipantId, isStarred, isArchived, syncedAt
- **AND** a unique constraint on (visitorId, groupId) prevents duplicates

#### Scenario: Foreign key integrity

- **GIVEN** a SyncedGroup record
- **WHEN** the referenced Group is deleted
- **THEN** the SyncedGroup is cascade-deleted
- **AND** when the referenced Participant is deleted, activeParticipantId is set to null

### Requirement: Omitted Groups List

The system SHALL maintain a list of hashed group IDs that should not be re-synced.

#### Scenario: Omit list structure

- **GIVEN** a SyncVisitor record
- **WHEN** storing omitted groups
- **THEN** the omittedGroupIds field contains SHA-256 hashes of group IDs
- **AND** hashes are stored as hex strings (64 characters each)

#### Scenario: GDPR compliance

- **GIVEN** hashed group IDs in omittedGroupIds
- **WHEN** data is inspected
- **THEN** original group IDs cannot be recovered from hashes

### Requirement: List Synced Groups

The system SHALL provide an API to list active synced groups for the authenticated user.

#### Scenario: User with synced groups

- **GIVEN** an authenticated user with synced groups
- **WHEN** they request their synced groups
- **THEN** the system returns groups where removedAt is null
- **AND** includes group name, currency, isStarred, isArchived, activeParticipantId

#### Scenario: Excludes soft-deleted groups

- **GIVEN** an authenticated user with some soft-deleted synced groups
- **WHEN** they request their synced groups
- **THEN** groups with removedAt set are excluded from results

#### Scenario: Unauthenticated request

- **GIVEN** an unauthenticated request
- **WHEN** attempting to list synced groups
- **THEN** the system returns an authentication error

### Requirement: Add Group to Sync

The system SHALL allow authenticated users to sync a group with its current state.

#### Scenario: Sync a new group

- **GIVEN** an authenticated user
- **WHEN** they sync a group with isStarred and isArchived flags
- **THEN** the system creates a SyncedGroup record with those flags
- **AND** returns success

#### Scenario: Re-sync an omitted group

- **GIVEN** an authenticated user with a group hash in omittedGroupIds
- **WHEN** they explicitly sync that group again
- **THEN** the system removes the hash from omittedGroupIds
- **AND** creates a new SyncedGroup record

#### Scenario: Sync already active group

- **GIVEN** an authenticated user with an active sync for a group
- **WHEN** they sync the same group with updated flags
- **THEN** the system updates isStarred, isArchived, activeParticipantId
- **AND** returns success (upsert behavior)

#### Scenario: Sync non-existent group

- **GIVEN** an authenticated user
- **WHEN** they sync a group ID that does not exist
- **THEN** the system returns an error

### Requirement: Remove Group from Sync

The system SHALL hard-delete sync relationships and add to omit list when users unsync groups.

#### Scenario: Unsync a synced group

- **GIVEN** an authenticated user with an active synced group
- **WHEN** they unsync the group
- **THEN** the system deletes the SyncedGroup record
- **AND** adds SHA-256 hash of groupId to omittedGroupIds
- **AND** returns success

#### Scenario: Unsync already removed group

- **GIVEN** an authenticated user with no sync record but hash in omittedGroupIds
- **WHEN** they unsync the same group
- **THEN** the system returns success (idempotent, hash already present)

### Requirement: Bulk Sync Groups

The system SHALL allow syncing multiple groups in a single request with rate limiting.

#### Scenario: Sync all recent groups

- **GIVEN** an authenticated user
- **WHEN** they request to sync multiple groups (max 100 per request)
- **THEN** the system creates/updates SyncedGroup records for valid groups
- **AND** skips groups whose hash is in omittedGroupIds
- **AND** returns count of successfully synced groups and list of skipped groups

#### Scenario: Bulk sync exceeds limit

- **GIVEN** a request with more than 100 groups
- **WHEN** processed
- **THEN** the system rejects the request with a rate limit error
- **AND** client must batch into smaller requests

#### Scenario: Auto-sync respects omit list

- **GIVEN** a user with syncNewGroups enabled and a group hash in omittedGroupIds
- **WHEN** auto-sync attempts to sync that group
- **THEN** the group is NOT synced due to omit list

### Requirement: Update Sync Metadata

The system SHALL allow updating metadata on synced groups.

#### Scenario: Update active participant

- **GIVEN** an authenticated user with a synced group
- **WHEN** they update the activeParticipantId
- **THEN** the system updates the SyncedGroup record (last-write-wins)

#### Scenario: Update starred status

- **GIVEN** an authenticated user with a synced group
- **WHEN** they toggle isStarred
- **THEN** the system updates the flag (last-write-wins)

#### Scenario: Update archived status

- **GIVEN** an authenticated user with a synced group
- **WHEN** they toggle isArchived
- **THEN** the system updates the flag (last-write-wins)

### Requirement: Sync Preferences

The system SHALL store per-user sync behavior preferences.

#### Scenario: Get preferences

- **GIVEN** an authenticated user
- **WHEN** they request their sync preferences
- **THEN** the system returns syncExisting and syncNewGroups flags

#### Scenario: Update preferences

- **GIVEN** an authenticated user
- **WHEN** they update sync preferences
- **THEN** the system saves the new values

#### Scenario: Default preferences

- **GIVEN** a new user with no preferences set
- **WHEN** preferences are queried
- **THEN** syncExisting and syncNewGroups default to false (manual mode)

### Requirement: Cascade Delete on Group Deletion

The system SHALL automatically remove sync relationships when a group is deleted.

#### Scenario: Group deleted

- **GIVEN** a group that is synced by one or more users
- **WHEN** the group is deleted from the database
- **THEN** all associated SyncedGroup records are hard-deleted via cascade
