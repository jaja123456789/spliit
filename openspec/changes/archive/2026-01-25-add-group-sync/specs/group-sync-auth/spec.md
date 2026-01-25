# Capability: Group Sync Authentication

NextAuth magic link (email) authentication for group sync feature.

## ADDED Requirements

### Requirement: Magic Link Request

The system SHALL allow users to request a magic link by providing their email address via NextAuth email provider.

#### Scenario: Valid email request

- **GIVEN** a user on the settings page
- **WHEN** they enter a valid email address and submit
- **THEN** the system normalizes the email to lowercase
- **AND** NextAuth creates a verification token
- **AND** sends an email via SMTP with the verification link
- **AND** shows a confirmation message

#### Scenario: Email case normalization

- **GIVEN** a user enters "User@Example.COM"
- **WHEN** the system processes the email
- **THEN** it is stored and matched as "user@example.com"

#### Scenario: Development mode email

- **GIVEN** SMTP_HOST environment variable is not set
- **WHEN** a magic link is requested
- **THEN** the email is written to `.mail/` directory instead of being sent
- **AND** the file contains the verification link for testing

### Requirement: Magic Link Verification

The system SHALL verify magic link tokens via NextAuth and create authenticated sessions.

#### Scenario: Valid token verification

- **GIVEN** a user clicks a valid, unexpired magic link
- **WHEN** NextAuth processes the callback
- **THEN** the verification token is consumed
- **AND** a database session is created
- **AND** the user is redirected to the settings page

#### Scenario: Expired token

- **GIVEN** a magic link token that has expired
- **WHEN** the user clicks the link
- **THEN** NextAuth shows an error page
- **AND** the user can request a new link

#### Scenario: New user verification

- **GIVEN** a valid magic link for an email not in the system
- **WHEN** NextAuth processes the callback
- **THEN** a new User record is created
- **AND** a session is created for the new user

### Requirement: Session Management

The system SHALL maintain authenticated sessions via NextAuth database sessions.

#### Scenario: Authenticated request

- **GIVEN** a valid NextAuth session
- **WHEN** the user makes an authenticated API request
- **THEN** getServerSession returns the user context

#### Scenario: Logout with clear prompt

- **GIVEN** an authenticated user
- **WHEN** they click logout
- **THEN** a prompt asks "Clear synced groups from this device?"
- **AND** if user chooses "Yes": localStorage sync data is cleared
- **AND** if user chooses "No": localStorage remains intact for local-only access
- **AND** NextAuth deletes the session
- **AND** the user is redirected to settings page (signed out)

#### Scenario: Logout prompt dismissed

- **GIVEN** the logout prompt is shown
- **WHEN** the user dismisses it (closes dialog, clicks outside)
- **THEN** logout is cancelled and user remains signed in

#### Scenario: UI state after logout

- **GIVEN** user completes logout (with either clear option)
- **WHEN** the logout completes
- **THEN** the page performs a hard refresh or router.refresh()
- **AND** all cached React state is cleared to prevent stale UI

### Requirement: Current User Query

The system SHALL provide session state to client components.

#### Scenario: Authenticated user

- **GIVEN** a valid session
- **WHEN** the client checks auth state
- **THEN** the user's email and id are available

#### Scenario: Unauthenticated request

- **GIVEN** no session
- **WHEN** the client checks auth state
- **THEN** null/unauthenticated state is returned
