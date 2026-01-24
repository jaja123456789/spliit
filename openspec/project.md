# Project Context

## Purpose

Open-source expense-splitting app. Track shared expenses, calculate balances, suggest reimbursements.

## Tech Stack

- **Framework**: Next.js 14 (App Router), TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **API**: tRPC + Zod validation
- **UI**: React, Tailwind CSS, shadcn/UI (Radix), Lucide icons
- **Forms**: React Hook Form + Zod
- **Testing**: Jest (unit), Playwright (e2e)
- **Other**: next-intl (i18n), OpenAI (receipt extraction), Day.js, SuperJSON

## Project Conventions

### Code Style

- **Prettier**: No semicolons, single quotes, organized imports
- **ESLint**: next/core-web-vitals
- **Files**: kebab-case for components, camelCase for utils, `.procedure.ts` for tRPC
- **Components**: PascalCase; functions/variables: camelCase
- **Imports**: `@/` prefix for absolute imports; external libs first

### Architecture Patterns

- **src/app/**: Next.js App Router pages, layouts, Server Actions
- **src/trpc/routers/**: tRPC procedures by domain (thin wrappers)
- **src/lib/**: Business logic (api.ts), schemas, utilities
- **src/components/**: React components; `ui/` for shadcn primitives
- Server components default; `"use client"` for interactivity
- tRPC hooks for data fetching; React Context for app-level state

### Testing Strategy

- **Unit**: Jest tests colocated (`*.test.ts`) in src/lib/
- **E2E**: Playwright in tests/; helpers for API setup
- CI runs type-check, lint, format, unit tests, build on push/PR

### Git Workflow

- PR-based workflow to main branch
- Conventional commits preferred (feat:, fix:, etc.)

## Domain Context

- **Amounts**: Stored as integers (cents). 100 = $1.00
- **Split modes**: EVENLY, BY_SHARES, BY_PERCENTAGE (basis points: 2500 = 25%), BY_AMOUNT
- **Balances**: `paid - owed`; greedy algorithm for reimbursement suggestions
- **Entities**: Group → Participants → Expenses (with paidBy, paidFor, splitMode)

## Important Constraints

- Reimbursements excluded from spending totals
- BY_PERCENTAGE shares must sum to 10000; BY_AMOUNT shares must equal expense amount
- Prisma uses `include` for relations (no separate fetches)

## External Dependencies

- PostgreSQL database
- OpenAI API (optional receipt extraction)
- S3-compatible storage (document uploads)
