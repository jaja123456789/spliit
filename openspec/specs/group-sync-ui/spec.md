# group-sync-ui Specification

## Purpose

Settings page and UI controls for managing group synchronization: authentication, preferences, and sync status.

## Requirements

### Requirement: Settings Page

The system SHALL provide `/settings` page with authentication and sync management.

#### Scenario: Unauthenticated user

- **GIVEN** an unauthenticated user
- **WHEN** they visit `/settings`
- **THEN** they see email input, "Send magic link" button, and explanatory text

#### Scenario: Authenticated user

- **GIVEN** an authenticated user
- **WHEN** they visit `/settings`
- **THEN** they see their email, sign-out button, sync preferences, list of synced groups with unsync buttons, and "Sync all groups now" button

#### Scenario: Magic link sent confirmation

- **GIVEN** a user who requested a magic link
- **WHEN** the request completes
- **THEN** they see confirmation message with instructions to check email (.mail/ folder in dev)

### Requirement: Sync Preferences

The system SHALL allow users to configure automatic sync behavior.

#### Scenario: Toggle sync new groups

- **GIVEN** an authenticated user on settings
- **WHEN** they toggle "Sync new groups" preference
- **THEN** the preference is saved and new groups are automatically synced on visit (if enabled)

#### Scenario: Manual sync all

- **GIVEN** an authenticated user with local groups
- **WHEN** they click "Sync all groups now"
- **THEN** all local groups are synced to server, results show count of synced/skipped groups

### Requirement: Synced Groups Management

The system SHALL display synced groups with metadata and unsync capability.

#### Scenario: List synced groups

- **GIVEN** an authenticated user
- **WHEN** they view synced groups list
- **THEN** each group shows name, star/archive status, unsync button, and link to group

#### Scenario: Unsync a group

- **GIVEN** a logged-in user viewing a synced group
- **WHEN** they click unsync
- **THEN** the SyncedGroup record is deleted and group ID hash is added to omit list

### Requirement: Sign-Out with Local Data Option

The system SHALL prompt for local data clearing on sign-out.

#### Scenario: Sign-out with clear prompt

- **GIVEN** an authenticated user
- **WHEN** they click sign-out
- **THEN** a dialog asks "Clear synced groups from this device?"
- **AND** selecting "Yes" clears localStorage sync data, selecting "No" preserves it
- **AND** session is deleted and page refreshes

#### Scenario: Sign-out dismissed

- **GIVEN** the sign-out dialog is shown
- **WHEN** the user dismisses it
- **THEN** sign-out is cancelled and user remains signed in
