# group-sync-auth Specification

## Purpose

Secure authentication via email magic links and session management for group sync access.

## Requirements

### Requirement: Magic Link Authentication

The system SHALL send magic links via email for passwordless sign-in.

#### Scenario: Request magic link

- **GIVEN** a user on settings page
- **WHEN** they enter a valid email and submit
- **THEN** the email is normalized to lowercase
- **AND** NextAuth creates a verification token
- **AND** sends an email via SMTP (or writes to `.mail/` in dev when SMTP_HOST not set)

#### Scenario: Verify magic link

- **GIVEN** a valid, unexpired magic link token
- **WHEN** the user clicks the link
- **THEN** NextAuth verifies the token
- **AND** creates a database session
- **AND** redirects to settings page

#### Scenario: Expired token

- **GIVEN** an expired magic link
- **WHEN** the user clicks it
- **THEN** NextAuth shows an error and user can request a new link

#### Scenario: New user

- **GIVEN** a magic link for an email not in the system
- **WHEN** verified
- **THEN** a User record is created and session is established

### Requirement: Session Management

The system SHALL maintain authenticated sessions via NextAuth.

#### Scenario: Authenticated request

- **GIVEN** a valid session
- **WHEN** accessing protected API
- **THEN** getServerSession returns user context (email, id)

#### Scenario: Unauthenticated request

- **GIVEN** no valid session
- **WHEN** accessing protected API
- **THEN** null is returned

### Requirement: Sign-Out

The system SHALL sign out users with optional local data clearing.

#### Scenario: Sign-out with prompt

- **GIVEN** an authenticated user
- **WHEN** they click sign-out
- **THEN** a dialog asks "Clear synced groups from this device?"
- **AND** "Yes" clears localStorage sync data before session deletion
- **AND** "No" preserves localStorage and deletes only the session
- **AND** page refreshes after session deletion
