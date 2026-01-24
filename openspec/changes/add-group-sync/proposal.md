# Change: Add Group Cloud Sync

## Why

Users want to access their groups across multiple devices without manually sharing URLs. Currently groups are stored locally (localStorage) with no cross-device persistence. A lightweight cloud sync feature—authenticated via email magic links—would let users sync group IDs, starred/archived status, and active participant selection across browsers/devices.

## What Changes

- **New**: Global settings page (`/settings`) for sign-in/sign-out and sync preferences
- **New**: NextAuth integration with magic link (email) provider for future OAuth extensibility
- **New**: Database tables for NextAuth (users, accounts, sessions) + SyncVisitor, SyncedGroup, SyncPreferences
- **New**: tRPC procedures for sync (list, add, remove groups, update metadata, preferences)
- **New**: Sync status indicator (cloud icon) on group cards
- **New**: Bidirectional sync: server→localStorage hydration on sign-in, localStorage→server on sync
- **New**: Configurable sync behavior: manual, sync existing, sync future groups (auto-sync)
- **New**: Starred and archived group status syncing
- **New**: Active participant selection syncing
- **New**: Local email development mode (writes to `.mail/` folder instead of sending)
- **New**: Omit list with hashed group IDs (prevents re-sync, GDPR-safe)
- **Modified**: Recent groups list shows sync indicators when logged in
- **Modified**: Prompt when removing synced group from recents (keep synced or unsync)
- **Modified**: Star/archive/active-participant changes sync to server when logged in

## Impact

- Affected specs: `group-sync-auth` (new), `group-sync-storage` (new), `group-sync-ui` (new)
- Affected code:
  - `prisma/schema.prisma` - NextAuth models + SyncVisitor, SyncedGroup, SyncPreferences
  - `src/app/api/auth/[...nextauth]/` - NextAuth route handler
  - `src/trpc/routers/sync/` - new sync router
  - `src/app/settings/` - new settings page
  - `src/app/groups/` - sync indicators, hydration logic
  - `src/lib/email.ts` - SMTP sender with local dev fallback
  - `src/lib/sync-hydration.ts` - localStorage hydration helper
- External dependencies: SMTP server (production), NextAuth

## Key Design Decisions

| Decision                     | Rationale                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| NextAuth over in-house       | Future OAuth extensibility without rewrite                                |
| SMTP over proprietary        | No vendor lock-in, universal support                                      |
| Omit list (hashed IDs)       | Prevents re-sync, GDPR-safe (can't reverse hash), no orphaned records     |
| Bidirectional sync           | New device sees synced groups immediately                                 |
| Account isolation            | Sign-in overwrites localStorage to prevent group leakage between accounts |
| Last-write-wins conflicts    | Simple, acceptable for v1                                                 |
| Starred/archived sync        | Full parity across devices                                                |
| Max 100 groups per bulk sync | Rate limiting to prevent DB overload                                      |

## Out of Scope (v1)

- Real-time sync / WebSocket updates
- Offline queue for pending syncs
- Conflict resolution UI (merge dialogs)
- Account migration (change email)
- Sharing groups between accounts
- OAuth providers (architecture ready, not implemented)
