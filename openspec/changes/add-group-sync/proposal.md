# Change: Add Group Cloud Sync

## Why

Users want to access their groups across multiple devices without manually sharing URLs. Currently groups are stored locally (localStorage) with no cross-device persistence. A lightweight cloud sync feature—authenticated via email magic links—would let users sync group IDs, starred/archived status, and active participant selection across browsers/devices.

## What Changes

- **New**: Global settings page (`/settings`) for sign-in/sign-out and sync preferences
- **New**: NextAuth integration with magic link (email) provider for future OAuth extensibility
- **New**: Database tables for NextAuth (users, accounts, sessions) + SyncVisitor, SyncedGroup, SyncPreferences
- **New**: tRPC procedures for sync (list, add, remove groups, update metadata, preferences)
- **New**: Sync status indicator (cloud icon) on group cards with toggle button
- **New**: Bidirectional sync: server→localStorage restore on sign-in, localStorage→server on sync
- **New**: Configurable sync behavior: manual or auto-sync new groups
- **New**: Starred and archived group status syncing
- **New**: Active participant selection syncing (on form save, not on select)
- **New**: Local email development mode (writes to `.mail/` folder instead of sending)
- **New**: Omit list with hashed group IDs (prevents re-sync, GDPR-safe)
- **New**: Auth error page (`/auth/error`) for expired/used magic links
- **New**: Sync feature announcement for existing users (dismissible, 2-month expiry)
- **New**: Sync promo for new users in empty groups state (hidden when signed in)
- **Modified**: Recent groups list shows sync indicators when logged in
- **Modified**: Prompt when removing synced group from recents (keep synced or unsync)
- **Modified**: Star/archive changes sync to server when logged in
- **Modified**: Header navigation includes "Settings" text link (not icon)

## Impact

- Affected specs: `group-sync-auth` (new), `group-sync-storage` (new), `group-sync-ui` (new)
- Affected code:
  - `prisma/schema.prisma` - NextAuth models + SyncVisitor, SyncedGroup, SyncPreferences
  - `src/app/api/auth/[...nextauth]/route.ts` - NextAuth route handler
  - `src/app/auth/error/page.tsx` - Auth error page
  - `src/trpc/routers/sync/` - sync router with shared schemas
  - `src/app/settings/` - settings page with extracted components
  - `src/app/settings/components/` - SignInForm, AccountInfo, SyncPreferences, SyncAllGroups, SyncedGroupsList
  - `src/app/groups/` - sync indicators, auto-sync logic
  - `src/components/sync-feature-announcement.tsx` - self-contained announcement component
  - `src/components/sync-restore-provider.tsx` - localStorage restore on sign-in
  - `src/components/sync-status-indicator.tsx` - three-state indicator (synced/pending/not-synced)
  - `src/lib/email.ts` - SMTP transport with interface pattern
  - `src/lib/email-templates.ts` - Magic link email template
  - `src/lib/sync-restore.ts` - localStorage restore helper (renamed from hydration)
- External dependencies: SMTP server (production), NextAuth, @tanstack/react-query

## Key Design Decisions

| Decision                         | Rationale                                                                 |
| -------------------------------- | ------------------------------------------------------------------------- |
| NextAuth over in-house           | Future OAuth extensibility without rewrite                                |
| SMTP over proprietary            | No vendor lock-in, universal support                                      |
| Omit list (hashed IDs)           | Prevents re-sync, GDPR-safe (can't reverse hash), no orphaned records     |
| Bidirectional sync               | New device sees synced groups immediately                                 |
| Account isolation                | Sign-in overwrites localStorage to prevent group leakage between accounts |
| Last-write-wins conflicts        | Simple, acceptable for v1                                                 |
| Starred/archived sync            | Full parity across devices                                                |
| Max 100 groups per bulk sync     | Rate limiting to prevent DB overload                                      |
| "Sync restore" naming            | Avoids confusion with React hydration terminology                         |
| Removed "sync existing" toggle   | Users can use "Sync All" button instead                                   |
| Active participant syncs on save | Not on select change - preserves form submission flow                     |
| Sync All clears omit list        | Explicit sync overrides previous unsync decisions                         |
| Prisma transactions              | All multi-operation procedures wrapped for consistency                    |
| Shared Zod schemas               | DRY validation with `groupMetadataSchema` composition                     |
| Interface pattern for email      | SmtpTransport/LocalFileTransport for extensibility                        |
| React Query for auth form        | Cleaner async state management                                            |
| Settings components extracted    | SignInForm, AccountInfo, etc. for maintainability                         |

## Implementation Details

### File Structure

```
src/
├── app/
│   ├── api/auth/[...nextauth]/route.ts
│   ├── auth/error/page.tsx
│   ├── settings/
│   │   ├── page.tsx
│   │   ├── settings-content.tsx (78 lines, compositional)
│   │   └── components/
│   │       ├── index.ts
│   │       ├── sign-in-form.tsx (react-query mutation)
│   │       ├── account-info.tsx (logout dialog)
│   │       ├── sync-preferences.tsx
│   │       ├── sync-all-groups.tsx
│   │       └── synced-groups-list.tsx
│   └── groups/
│       ├── recent-group-list.tsx
│       ├── recent-group-list-card.tsx
│       └── [groupId]/
│           ├── auto-sync-on-visit.tsx
│           └── edit/edit-group.tsx (syncs activeParticipant on save)
├── components/
│   ├── sync-feature-announcement.tsx (self-contained visibility logic)
│   ├── sync-restore-provider.tsx
│   └── sync-status-indicator.tsx (synced/pending/not-synced states)
├── lib/
│   ├── auth.ts
│   ├── email.ts (interface pattern: EmailTransport)
│   ├── email-templates.ts (magicLinkEmail)
│   └── sync-restore.ts (renamed from hydration)
└── trpc/routers/sync/
    ├── index.ts
    ├── schemas.ts (shared Zod schemas with groupMetadataSchema)
    ├── protected.ts (auth middleware)
    ├── utils.ts (hashGroupId)
    ├── addGroup.procedure.ts (transaction wrapped)
    ├── removeGroup.procedure.ts (transaction wrapped)
    ├── syncAll.procedure.ts (clearOmitList flag, transaction)
    ├── updateMetadata.procedure.ts (transaction wrapped)
    ├── getPreferences.procedure.ts
    ├── updatePreferences.procedure.ts
    ├── listGroups.procedure.ts
    └── isOmitted.procedure.ts
```

### Database Schema

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  accounts      Account[]
  sessions      Session[]
  syncVisitor   SyncVisitor?
  createdAt     DateTime  @default(now())
}

model SyncVisitor {
  id              String           @id @default(cuid())
  userId          String           @unique
  user            User             @relation(...)
  preferences     SyncPreferences?
  syncedGroups    SyncedGroup[]
  omittedGroupIds String[]  // SHA-256 hashes
  createdAt       DateTime  @default(now())
}

model SyncPreferences {
  id            String      @id @default(cuid())
  visitorId     String      @unique
  visitor       SyncVisitor @relation(...)
  syncNewGroups Boolean     @default(false)
}

model SyncedGroup {
  id                  String       @id @default(cuid())
  visitorId           String
  groupId             String
  activeParticipantId String?
  isStarred           Boolean      @default(false)
  isArchived          Boolean      @default(false)
  syncedAt            DateTime     @default(now())
  @@unique([visitorId, groupId])
}
```

### Shared Zod Schemas

```typescript
// Base schemas
export const groupIdSchema = z.string().min(1)
export const participantIdSchema = z.string().optional()

// Shared metadata (DRY)
export const groupMetadataSchema = z.object({
  isStarred: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  activeParticipantId: participantIdSchema,
})

// Composed schemas
export const groupWithMetadataSchema = z
  .object({
    groupId: groupIdSchema,
  })
  .merge(groupMetadataSchema)
```

## Out of Scope (v1)

- Real-time sync / WebSocket updates
- Offline queue for pending syncs
- Conflict resolution UI (merge dialogs)
- Account migration (change email)
- Sharing groups between accounts
- OAuth providers (architecture ready, not implemented)
- "Sync existing groups" preference (removed - use Sync All button)

## Testing

- **Unit tests**: 173 tests passing
  - Email local fallback (writes to .mail/)
  - Sync logic (hash function, omit list)
  - Sync restore merge logic (server wins conflicts)
- **E2E tests**: Playwright specs created
  - Magic link sign in
  - Sync/unsync group flow
  - Auto-sync preferences
  - Logout with clear prompt
