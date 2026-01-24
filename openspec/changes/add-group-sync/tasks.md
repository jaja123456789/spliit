# Tasks: Add Group Cloud Sync

## 1. Database Schema

- [x] 1.1 Add NextAuth models (User, Account, Session, VerificationToken) via Prisma adapter
- [x] 1.2 Add `SyncVisitor` model (links User to sync data, 1:1 with User)
- [x] 1.3 Add `SyncPreferences` model (syncNewGroups only - syncExisting removed)
- [x] 1.4 Add `SyncedGroup` model with:
  - Starred/archived flags (`isStarred`, `isArchived`)
  - Active participant (`activeParticipantId` FK to Participant, ON DELETE SET NULL)
  - Unique constraint `@@unique([visitorId, groupId])`
- [x] 1.4b Add `omittedGroupIds String[]` field to SyncVisitor (hashed IDs to skip)
- [x] 1.5 Add relation from Group to SyncedGroup (cascade delete)
- [x] 1.6 Add relation from Participant to SyncedGroup (set null on delete)
- [x] 1.7 Create and run migration

## 2. Email Infrastructure

- [x] 2.1 Create `src/lib/email.ts` with interface pattern (SmtpTransport/LocalFileTransport)
- [x] 2.2 Implement local dev fallback: write .eml files to `.mail/` when SMTP_HOST unset
- [x] 2.3 Add `.mail/` to `.gitignore`
- [x] 2.4 Add email env vars to `.env.example` (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)
- [x] 2.5 Extract email template to `src/lib/email-templates.ts`

## 3. NextAuth Setup

- [x] 3.1 Install next-auth and @auth/prisma-adapter
- [x] 3.2 Create `src/app/api/auth/[...nextauth]/route.ts`
- [x] 3.3 Configure Email provider with custom sendVerificationRequest using email-templates.ts
- [x] 3.3b Add email normalization (lowercase) before storing/matching
- [x] 3.4 Configure Prisma adapter
- [x] 3.5 Create `src/lib/auth.ts` with getServerSession helper
- [x] 3.6 Add NEXTAUTH_SECRET and NEXTAUTH_URL to `.env.example`
- [x] 3.7 Create `src/app/auth/error/page.tsx` for expired/used magic links

## 4. Sync Backend

- [x] 4.1 Create tRPC router `src/trpc/routers/sync/index.ts`
- [x] 4.2 Implement `sync.listGroups` (get user's synced groups, include group metadata)
- [x] 4.3 Implement `sync.addGroup` (sync group with isStarred, isArchived; clear hash from omit list)
- [x] 4.4 Implement `sync.removeGroup` (hard delete SyncedGroup, add hash to omittedGroupIds)
- [x] 4.5 Implement `sync.syncAll` (bulk sync, max 100, clearOmitList flag)
- [x] 4.6 Implement `sync.updateMetadata` (update activeParticipantId, isStarred, isArchived)
- [x] 4.7 Implement `sync.getPreferences`
- [x] 4.8 Implement `sync.updatePreferences`
- [x] 4.9 Implement `sync.isOmitted` (check if group hash is in omittedGroupIds)
- [x] 4.10 Add sync router to main app router
- [x] 4.11 Create shared Zod schemas (`src/trpc/routers/sync/schemas.ts`)
- [x] 4.12 Wrap procedures in Prisma transactions for consistency
- [x] 4.13 Add activeParticipantId validation (belongs to group)

## 5. Settings Page

- [x] 5.1 Create `/settings/page.tsx` layout
- [x] 5.2 Implement signed-out state: email input + "Send magic link" button (react-query mutation)
- [x] 5.3 Implement magic link sent state: confirmation message
- [x] 5.4 Implement signed-in state: email display, logout button with confirmation prompt
- [x] 5.5 Implement logout confirmation dialog ("Clear synced groups from this device?")
- [x] 5.5b After logout completes, force router.refresh() to clear stale React state
- [x] 5.6 Add sync preferences toggle (sync new groups only - removed sync existing)
- [x] 5.7 Add "Sync all groups now" action button (clears omit list)
- [x] 5.8 Add synced groups list with unsync buttons and clickable group names
- [x] 5.9 Add navigation link to settings in header ("Settings" text, not icon)
- [x] 5.10 Extract components to `src/app/settings/components/`:
  - SignInForm (react-query), AccountInfo, SyncPreferences, SyncAllGroups, SyncedGroupsList

## 6. Sync Restore on Sign-In (renamed from Hydration)

- [x] 6.1 Create `src/lib/sync-restore.ts` helper for localStorage restore
- [x] 6.2 Create `src/components/sync-restore-provider.tsx`
- [x] 6.3 Fetch synced groups from server with retry logic (3 attempts, exponential backoff)
- [x] 6.4 Merge server groups with local groups (server wins for conflicts on same groupId)
- [x] 6.5 Populate localStorage recentGroups, starredGroups, archivedGroups from merged data
- [x] 6.6 Set "sync-restore-complete" flag in localStorage
- [x] 6.7 On app load: if session exists but no restore flag → retry restore

## 7. Group List UI Updates

- [x] 7.1 Create sync status indicator component (synced/pending/not-synced states)
- [x] 7.2 Add sync toggle button to group cards (visible when logged in)
- [x] 7.3 Remove duplicate sync indicator (kept toggle button only)
- [x] 7.4 Implement confirmation modal for removing synced group from recents
- [x] 7.5 Implement auto-sync on first group visit (when syncNewGroups enabled, check omit list)
- [x] 7.6 Implement auto-sync on group creation (when syncNewGroups enabled)
- [x] 7.7 Add error handling for sync operations (network errors, session expiry)
- [x] 7.8 Extract sync announcement to `src/components/sync-feature-announcement.tsx`
- [x] 7.9 Hide sync promos when user is signed in

## 8. Starred/Archived/ActiveParticipant Sync

- [x] 8.1 Update star/unstar actions to call sync.updateMetadata when logged in
- [x] 8.2 Update archive/unarchive actions to call sync.updateMetadata when logged in
- [x] 8.3 Move active participant sync to form submit (edit-group.tsx, create-group.tsx)
- [x] 8.4 Remove immediate sync from group-form.tsx onValueChange

## 9. Testing

- [x] 9.1 Unit tests for email local fallback (writes to .mail/)
- [x] 9.2 Unit tests for sync logic (omit list hashing, re-sync clears hash)
- [x] 9.3 Unit tests for sync restore merge logic (server wins for conflicts)
- [x] 9.4 E2E test: magic link sign in (using .mail/ folder to get link)
- [x] 9.5 E2E test: sync/unsync group flow
- [x] 9.6 E2E test: auto-sync preference flow (first visit + group creation)
- [x] 9.7 E2E test: remove synced group from recents (confirmation dialog)
- [x] 9.8 E2E test: sync restore on sign-in (verify merge with local groups)
- [x] 9.9 E2E test: starred/archived sync across simulated devices
- [x] 9.10 E2E test: logout with clear prompt (both yes and no paths)
- [x] 9.11 E2E test: sync error handling (simulate network failure)

## 10. Documentation

- [x] 10.1 Document all env vars in `.env.example` with comments
- [x] 10.2 Add sync feature section to README (how it works, setup SMTP)

## Post-Implementation Refinements

- [x] Fix race condition in omittedGroupIds mutations (atomic operations)
- [x] Add activeParticipantId FK validation in procedures
- [x] Add session.user.id null check in protected procedure
- [x] Rename "hydration" to "sync-restore" to avoid React terminology confusion
- [x] Consolidate settings components into single Card with sections
- [x] Extract auth components (SignInForm, AccountInfo)
- [x] Consolidate shared Zod schemas (groupMetadataSchema)
- [x] Improve email.ts with interface pattern
- [x] Use react-query useMutation for sign-in form

## Verification

- [x] TypeScript compilation passes (`npm run check-types`)
- [x] All 173 unit tests pass (`npm test`)
- [x] Production build succeeds (`npm run build`)
