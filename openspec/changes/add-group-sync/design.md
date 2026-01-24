# Design: Group Cloud Sync

## Context

Spliit currently stores group references in localStorage (`recentGroups`, `starredGroups`, `archivedGroups`). Users lose access to their groups when switching devices or clearing browser data. The goal is a simple cross-device sync without full user account management—just email verification for identity.

**Stakeholders**: End users wanting multi-device access
**Constraints**: Minimal complexity, no passwords, future OAuth possible

## Goals / Non-Goals

**Goals:**

- Sync group IDs, starred, archived status, and active participant across devices
- Magic link auth via NextAuth (email provider)
- Bidirectional sync: server↔localStorage
- Per-group explicit sync control OR automatic sync based on user preference
- Soft-delete unsynced groups to prevent re-sync from other devices
- Account isolation: signing out clears sync state, signing in hydrates from server

**Non-Goals:**

- Full user accounts with profiles/passwords (now)
- OAuth providers (now—architecture supports future addition)
- Real-time sync (pull-on-load is sufficient)
- Sharing groups between different email addresses
- Syncing expense data (groups already exist server-side)
- Offline queue/conflict resolution beyond last-write-wins
- GDPR hard delete (soft delete sufficient for v1)

## Decisions

### Auth: NextAuth with Email Provider

**Decision**: Use NextAuth with magic link (email) provider.

**Why**:

- Future OAuth extensibility (add Google, GitHub later without rewrite)
- Battle-tested session handling, CSRF protection
- Standard Prisma adapter available

**Implementation**:

- NextAuth Prisma adapter models: `User`, `Account`, `Session`, `VerificationToken`
- Email provider with custom SMTP transport
- Session strategy: `database` (not JWT) for easy revocation
- Use NextAuth defaults for rate limiting and session duration

### Email: SMTP with Local Dev Fallback

**Configuration**:

```env
# Production
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=noreply@spliit.app

# Development (when SMTP_HOST is unset)
# Emails written to .mail/ directory as .eml files
```

### Storage: Complete Data Model

```prisma
// NextAuth models (via @auth/prisma-adapter)
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  accounts      Account[]
  sessions      Session[]
  syncVisitor   SyncVisitor?
  createdAt     DateTime  @default(now())
}

model Account { /* NextAuth standard */ }
model Session { /* NextAuth standard */ }
model VerificationToken { /* NextAuth standard */ }

// Sync-specific models
model SyncVisitor {
  id              String           @id @default(cuid())
  userId          String           @unique
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  preferences     SyncPreferences?
  syncedGroups    SyncedGroup[]
  omittedGroupIds String[]         // Hashed group IDs to skip syncing (GDPR-safe)
  createdAt       DateTime         @default(now())
}

model SyncPreferences {
  id            String      @id @default(cuid())
  visitorId     String      @unique
  visitor       SyncVisitor @relation(fields: [visitorId], references: [id], onDelete: Cascade)
  syncExisting  Boolean     @default(false)
  syncNewGroups Boolean     @default(false)
}

model SyncedGroup {
  id                  String      @id @default(cuid())
  visitorId           String
  visitor             SyncVisitor @relation(fields: [visitorId], references: [id], onDelete: Cascade)
  groupId             String
  group               Group       @relation(fields: [groupId], references: [id], onDelete: Cascade)
  activeParticipantId String?
  activeParticipant   Participant? @relation(fields: [activeParticipantId], references: [id], onDelete: SetNull)
  isStarred           Boolean     @default(false)
  isArchived          Boolean     @default(false)
  syncedAt            DateTime    @default(now())

  @@unique([visitorId, groupId])
}

// Add relation to existing Group model
model Group {
  // ... existing fields
  syncedGroups SyncedGroup[]
}
```

**Key design**:

- `@@unique([visitorId, groupId])` prevents duplicate syncs
- `onDelete: Cascade` on Group FK removes orphaned SyncedGroups
- `onDelete: SetNull` on Participant FK handles deleted participants gracefully
- `omittedGroupIds` on SyncVisitor: hashed group IDs that won't be re-synced
  - GDPR-safe: hash can't be reversed to identify group
  - No metadata stored (no dates, no orphaned records)
  - Checked during sync operations to prevent re-sync from other devices

### Sync Direction: Bidirectional

```
Server → localStorage (Hydration):
- On sign-in: fetch all synced groups, populate localStorage
- Clears existing localStorage first (account isolation)
- Sets recentGroups, starredGroups, archivedGroups from server

localStorage → Server (Backup):
- Manual sync: user clicks sync button
- Auto-sync: when syncNewGroups enabled and user visits group
- Bulk sync: "sync all" action
```

### Account Isolation

**Critical for security**: Prevent group leakage between email accounts.

```
Sign-out flow:
1. Clear NextAuth session
2. Do NOT clear localStorage (groups remain accessible locally)

Sign-in flow:
1. Create/resume NextAuth session
2. Fetch synced groups from server for THIS account
3. Hydrate localStorage with server data (overwrites local state)
4. User sees only groups synced to their account
```

**Edge case**: User has local groups, signs in with new account

- Local groups are overwritten by server state
- Those groups are NOT automatically synced to new account
- User must manually sync them if desired

### Starred & Archived Sync

**Decision**: Sync starred and archived status alongside group sync.

- `isStarred` and `isArchived` flags on SyncedGroup
- When syncing a group, current starred/archived state is captured
- Hydration restores these states to localStorage

### Conflict Resolution: Last-Write-Wins

**Decision**: No merge logic. Last write wins for all fields.

- `activeParticipantId`: last device to set it wins
- `isStarred`/`isArchived`: last device to toggle wins
- Acceptable for v1; users can manually correct

### Omit List & Re-Sync Logic

```
Unsync flow:
1. User unsyncs group
2. Server deletes SyncedGroup record (hard delete)
3. Server adds hash(groupId) to omittedGroupIds array
4. Auto-sync checks omit list and skips matching groups

Re-sync flow:
1. User explicitly clicks sync on an omitted group
2. Server removes hash from omittedGroupIds
3. Server creates new SyncedGroup record
4. Group reappears in synced list

Benefits:
- GDPR-safe: hashed IDs can't identify original groups
- No orphaned records: SyncedGroup is hard-deleted
- No metadata bloat: just an array of hashes
- Same behavior: prevents Device B from re-syncing what Device A removed
```

**Hash function**: SHA-256 of groupId, stored as hex string (64 chars)

### Bulk Operations

**Rate limiting**: Max 100 groups per bulk sync request.

- "Sync all" batches into chunks of 100
- Client shows progress for large syncs
- Prevents DB overload

## Data Flow

```
Sign In Flow:
1. User enters email on /settings
2. NextAuth creates VerificationToken, sends email via SMTP (or .mail/)
3. User clicks link → NextAuth verifies, creates Session
4. Redirect to /settings (callback URL)
5. Client captures current localStorage state (pre-hydration)
6. Client fetches synced groups from server (with retry on failure)
7. Client MERGES server groups with local groups:
   - Groups on server but not local → add to local
   - Groups local but not on server → keep in local
   - Groups in both → server data wins (activeParticipant, starred, archived)
8. If syncExisting enabled: sync ALL merged groups to server

Sign Out Flow:
1. User clicks logout
2. Prompt: "Clear synced groups from this device?"
3. If "Yes": clear localStorage sync data (recentGroups, starredGroups, archivedGroups)
4. If "No": localStorage remains intact for local-only access
5. If dismissed: cancel logout
6. NextAuth destroys session

Group Visit (auto-sync enabled):
1. User visits /groups/[groupId] for the first time (not in localStorage)
2. Client checks: logged in? syncNewGroups? groupId hash not in omittedGroupIds?
3. If yes: call sync.addGroup({ groupId, isStarred, isArchived })
4. Update sync indicator

Group Creation (auto-sync enabled):
1. User creates new group, save succeeds
2. Client checks: logged in? syncNewGroups?
3. If yes: automatically sync the new group

Unsync from Recents:
1. User removes group from recents (via X button)
2. If group is synced: show confirmation dialog
3. User chooses "Keep synced" or "Also unsync"
4. If unsync: delete SyncedGroup, add hash to omittedGroupIds, remove from localStorage
5. If keep: group stays synced, visible on other devices
```

## Edge Cases Handled

| Scenario                               | Behavior                                                  |
| -------------------------------------- | --------------------------------------------------------- |
| Group deleted server-side              | Cascade deletes SyncedGroup, hydration skips it           |
| Participant deleted                    | activeParticipantId set to null via FK                    |
| Session expires mid-sync               | Client retries failed items on next page load             |
| User signs in with different email     | localStorage overwritten with new account's synced groups |
| 500+ groups in localStorage            | Bulk sync batched, progress shown                         |
| Magic link clicked on different device | Works fine (NextAuth handles this)                        |
| Group in both recents and archived     | Server stores both flags, hydration respects both         |

## Risks / Trade-offs

| Risk                              | Mitigation                                              |
| --------------------------------- | ------------------------------------------------------- |
| Email delivery failures           | Clear error messages, local dev fallback, show "resend" |
| localStorage overwrite on sign-in | Document behavior, consider "merge" option in v2        |
| Last-write-wins conflicts         | Acceptable for v1; timestamp visible for debugging      |
| Bulk sync timeout                 | Batch operations, retry failed items                    |

## Migration Plan

1. Add NextAuth + Sync models (non-breaking)
2. Add NextAuth route handler (non-breaking)
3. Add tRPC sync routes (non-breaking)
4. Add /settings page (non-breaking)
5. Add sync indicators to group cards (non-breaking)
6. No data migration needed (new feature, opt-in)

**Rollback**: Feature is additive. Disable routes and hide UI to rollback.

## Out of Scope (v1)

- Real-time sync / WebSocket updates
- Offline queue for pending syncs
- Conflict resolution UI (merge dialogs)
- Account migration (change email)
- GDPR hard delete (soft delete + cascade sufficient)
- Sharing groups between accounts
