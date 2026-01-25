# group-sync-storage Specification

## Purpose

Database and API layer for group sync relationships, preferences, and omit lists.

## Requirements

### Requirement: Synced Groups Storage

The system SHALL store group sync relationships with metadata (starred, archived, active participant).

#### Scenario: Sync a group

- **GIVEN** an authenticated user
- **WHEN** they sync a group with state flags
- **THEN** a SyncedGroup record is created with profileId, groupId, isStarred, isArchived, activeParticipantId, syncedAt
- **AND** a unique constraint on (profileId, groupId) prevents duplicates

#### Scenario: Foreign key integrity

- **GIVEN** a SyncedGroup record
- **WHEN** the referenced Group is deleted
- **THEN** the SyncedGroup is cascade-deleted
- **AND** when the referenced Participant is deleted, activeParticipantId is set to null

### Requirement: Omitted Groups List

The system SHALL maintain a list of hashed group IDs to prevent re-syncing unwanted groups.

#### Scenario: Omit list structure

- **GIVEN** a SyncProfile record
- **WHEN** storing omitted groups
- **THEN** omittedGroupIds field contains SHA-256 hashes of group IDs as hex strings

#### Scenario: GDPR compliance

- **GIVEN** hashed group IDs in omittedGroupIds
- **WHEN** data is inspected
- **THEN** original group IDs cannot be recovered

### Requirement: List Synced Groups API

The system SHALL return synced groups for the authenticated user.

#### Scenario: List synced groups

- **GIVEN** an authenticated user
- **WHEN** they request synced groups
- **THEN** all active SyncedGroup records are returned with name, currency, isStarred, isArchived, activeParticipantId
- **AND** soft-deleted groups (removedAt set) are excluded

#### Scenario: Unauthenticated request

- **GIVEN** no session
- **WHEN** requesting synced groups
- **THEN** an authentication error is returned

### Requirement: Add Group to Sync API

The system SHALL sync a group or update an existing sync record.

#### Scenario: Sync new group

- **GIVEN** an authenticated user
- **WHEN** they sync a group with state flags
- **THEN** a SyncedGroup is created or updated (upsert)
- **AND** if the group hash is in omittedGroupIds, it is removed

#### Scenario: Sync non-existent group

- **GIVEN** an authenticated user
- **WHEN** they sync a non-existent group ID
- **THEN** an error is returned

### Requirement: Remove Group from Sync API

The system SHALL unsync a group and add it to the omit list.

#### Scenario: Unsync a group

- **GIVEN** an authenticated user with a synced group
- **WHEN** they unsync the group
- **THEN** the SyncedGroup record is deleted
- **AND** the SHA-256 hash of groupId is added to omittedGroupIds

#### Scenario: Idempotent unsync

- **GIVEN** an authenticated user
- **WHEN** they unsync a group with hash already in omittedGroupIds
- **THEN** success is returned (no-op if already unsynced)

### Requirement: Bulk Sync API

The system SHALL sync multiple groups in one request with rate limiting.

#### Scenario: Sync multiple groups

- **GIVEN** an authenticated user
- **WHEN** they sync up to 100 groups
- **THEN** SyncedGroup records are created/updated for valid groups
- **AND** groups with hashes in omittedGroupIds are skipped
- **AND** results show count of synced and list of skipped groups

#### Scenario: Bulk sync exceeds limit

- **GIVEN** a request with >100 groups
- **WHEN** processed
- **THEN** a rate limit error is returned and client must batch into smaller requests

### Requirement: Update Sync Metadata API

The system SHALL update metadata on synced groups.

#### Scenario: Update active participant

- **GIVEN** an authenticated user with a synced group
- **WHEN** they update activeParticipantId
- **THEN** the SyncedGroup record is updated (last-write-wins)

#### Scenario: Update starred status

- **GIVEN** an authenticated user with a synced group
- **WHEN** they toggle isStarred
- **THEN** the flag is updated on the record

#### Scenario: Update archived status

- **GIVEN** an authenticated user with a synced group
- **WHEN** they toggle isArchived
- **THEN** the flag is updated on the record

### Requirement: Sync Preferences API

The system SHALL store and retrieve per-user sync preferences.

#### Scenario: Get preferences

- **GIVEN** an authenticated user
- **WHEN** they request preferences
- **THEN** syncNewGroups flags are returned (default false)

#### Scenario: Update preferences

- **GIVEN** an authenticated user
- **WHEN** they update sync preferences
- **THEN** the SyncPreferences record is saved

#### Scenario: New user defaults

- **GIVEN** a new user with no preferences set
- **WHEN** preferences are accessed
- **THEN** syncNewGroups default to false (manual mode)

### Requirement: Omit List Query API

The system SHALL check if a group ID is in the omit list.

#### Scenario: Check if group is omitted

- **GIVEN** an authenticated user
- **WHEN** they check if a group hash is in omittedGroupIds
- **THEN** true/false is returned indicating omit status
