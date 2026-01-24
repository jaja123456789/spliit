# Tasks: Add Group Cloud Sync

## 1. Database Schema

- [ ] 1.1 Add NextAuth models (User, Account, Session, VerificationToken) via Prisma adapter
- [ ] 1.2 Add `SyncVisitor` model (links User to sync data, 1:1 with User)
- [ ] 1.3 Add `SyncPreferences` model (syncExisting, syncNewGroups)
- [ ] 1.4 Add `SyncedGroup` model with:
  - Starred/archived flags (`isStarred`, `isArchived`)
  - Active participant (`activeParticipantId` FK to Participant, ON DELETE SET NULL)
  - Unique constraint `@@unique([visitorId, groupId])`
- [ ] 1.4b Add `omittedGroupIds String[]` field to SyncVisitor (hashed IDs to skip)
- [ ] 1.5 Add relation from Group to SyncedGroup (cascade delete)
- [ ] 1.6 Add relation from Participant to SyncedGroup (set null on delete)
- [ ] 1.7 Create and run migration

## 2. Email Infrastructure

- [ ] 2.1 Create `src/lib/email.ts` with SMTP transport (nodemailer)
- [ ] 2.2 Implement local dev fallback: write .eml files to `.mail/` when SMTP_HOST unset
- [ ] 2.3 Add `.mail/` to `.gitignore`
- [ ] 2.4 Add email env vars to `.env.example` (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)

## 3. NextAuth Setup

- [ ] 3.1 Install next-auth and @auth/prisma-adapter
- [ ] 3.2 Create `src/app/api/auth/[...nextauth]/route.ts`
- [ ] 3.3 Configure Email provider with custom sendVerificationRequest using src/lib/email.ts
- [ ] 3.3b Add email normalization (lowercase) before storing/matching
- [ ] 3.4 Configure Prisma adapter
- [ ] 3.5 Create `src/lib/auth.ts` with getServerSession helper
- [ ] 3.6 Add NEXTAUTH_SECRET and NEXTAUTH_URL to `.env.example`

## 4. Sync Backend

- [ ] 4.1 Create tRPC router `src/trpc/routers/sync/index.ts`
- [ ] 4.2 Implement `sync.listGroups` (get user's synced groups, exclude removedAt, include group metadata)
- [ ] 4.3 Implement `sync.addGroup` (sync group with isStarred, isArchived; clear removedAt if exists)
- [ ] 4.4 Implement `sync.removeGroup` (hard delete SyncedGroup, add hash to omittedGroupIds)
- [ ] 4.5 Implement `sync.syncAll` (bulk sync, max 100, skip groups in omittedGroupIds)
- [ ] 4.6 Implement `sync.updateMetadata` (update activeParticipantId, isStarred, isArchived)
- [ ] 4.7 Implement `sync.getPreferences`
- [ ] 4.8 Implement `sync.updatePreferences`
- [ ] 4.9 Implement `sync.isOmitted` (check if group hash is in omittedGroupIds)
- [ ] 4.10 Add sync router to main app router

## 5. Settings Page

- [ ] 5.1 Create `/settings/page.tsx` layout
- [ ] 5.2 Implement signed-out state: email input + "Send magic link" button
- [ ] 5.3 Implement magic link sent state: confirmation message
- [ ] 5.4 Implement signed-in state: email display, logout button with confirmation prompt
- [ ] 5.5 Implement logout confirmation dialog ("Clear synced groups from this device?")
- [ ] 5.5b After logout completes, force router.refresh() to clear stale React state
- [ ] 5.6 Add sync preferences toggles (sync existing, sync new groups) with descriptions
- [ ] 5.7 Add "Sync all groups now" action button with progress for large batches
- [ ] 5.8 Add synced groups list with unsync buttons
- [ ] 5.9 Add navigation link to settings in header (settings icon)

## 6. Hydration on Sign-In

- [ ] 6.1 Create `src/lib/sync-hydration.ts` helper for localStorage hydration
- [ ] 6.2 On NextAuth signIn callback, capture pre-hydration localStorage state
- [ ] 6.3 Fetch synced groups from server with retry logic (3 attempts, exponential backoff)
- [ ] 6.4 Merge server groups with local groups (server wins for conflicts on same groupId)
- [ ] 6.5 Populate localStorage recentGroups, starredGroups, archivedGroups from merged data
- [ ] 6.6 Set "hydration completed" flag in localStorage
- [ ] 6.7 If syncExisting enabled, sync ALL merged groups to server
- [ ] 6.8 On app load: if session exists but no hydration flag → retry hydration

## 7. Group List UI Updates

- [ ] 7.1 Create sync status indicator component (cloud icon)
- [ ] 7.2 Add sync indicator to group cards (visible when logged in)
- [ ] 7.3 Add sync/unsync toggle button on group cards
- [ ] 7.4 Implement confirmation modal for removing synced group from recents
- [ ] 7.5 Implement auto-sync on first group visit (when syncNewGroups enabled, check omit list)
- [ ] 7.6 Implement auto-sync on group creation (when syncNewGroups enabled)
- [ ] 7.7 Add error handling for sync operations (network errors, quota exceeded)
- [ ] 7.8 Add session expiry detection and re-auth prompt

## 8. Starred/Archived Sync

- [ ] 8.1 Update star/unstar actions to call sync.updateMetadata when logged in
- [ ] 8.2 Update archive/unarchive actions to call sync.updateMetadata when logged in
- [ ] 8.3 Update active participant selection to call sync.updateMetadata when logged in

## 9. Testing

- [ ] 9.1 Unit tests for email local fallback (writes to .mail/)
- [ ] 9.2 Unit tests for sync logic (omit list hashing, re-sync clears hash, unique constraint)
- [ ] 9.3 Unit tests for hydration merge logic (server wins for conflicts)
- [ ] 9.4 E2E test: magic link sign in (using .mail/ folder to get link)
- [ ] 9.5 E2E test: sync/unsync group flow
- [ ] 9.6 E2E test: auto-sync preference flow (first visit + group creation)
- [ ] 9.7 E2E test: remove synced group from recents (confirmation dialog)
- [ ] 9.8 E2E test: hydration on sign-in (verify merge with local groups)
- [ ] 9.9 E2E test: starred/archived sync across simulated devices
- [ ] 9.10 E2E test: logout with clear prompt (both yes and no paths)
- [ ] 9.11 E2E test: sync error handling (simulate network failure)

## 10. Documentation

- [ ] 10.1 Document all env vars in `.env.example` with comments
- [ ] 10.2 Add sync feature section to README (how it works, setup SMTP)

## Dependencies

- 2.x (email) independent, can start immediately
- 3.x depends on 1.x (NextAuth needs User model)
- 4.x depends on 1.x, 3.x
- 5.x depends on 3.x, 4.x
- 6.x depends on 4.x, 5.x
- 7.x depends on 4.x
- 8.x depends on 4.x, 7.x
- 9.x can start alongside implementation

## Parallelizable Work

- 1.x and 2.x can run in parallel
- 4.2-4.10 can run in parallel after 4.1
- 5.x, 6.x, 7.x, 8.x can run in parallel after 4.x
- 9.x tests can be written alongside implementation
