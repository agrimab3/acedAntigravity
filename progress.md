# AcedAntigravity Progress

## Project Snapshot

- Project: `AcedAntigravity`
- Product goal: production-ready, gamified ACT prep platform
- Working model: local development -> GitHub -> VPS CI/CD deployment
- Current repo baseline: earlier `Aced` prototype being upgraded

## Current Phase

- Phase 1: architecture lock-in and production foundation
- Phase 2: adaptive ACT intelligence foundation in progress
- Phase 3: practice test foundation started

## Completed So Far

- Reviewed the inherited `Aced` prototype and documented the app architecture
- Confirmed the new GitHub repo: `https://github.com/agrimab3/acedAntigravity.git`
- Confirmed VPS target path: `/root/apps/aced`
- Verified SSH access to the VPS
- Safely inspected the VPS and confirmed an existing PostgreSQL service is available
- Confirmed the existing PostgreSQL cluster can likely support a separate `aced` database
- Updated local env planning to use `OPENAI_API_KEY`
- Created foundational project documentation files
- Confirmed the existing VPS Caddy setup is present and the active Caddyfile is at `/etc/caddy/Caddyfile`
- Confirmed the intended production pattern: app runs on the VPS and Caddy handles reverse proxy and SSL
- Repointed the local repo to the new `acedAntigravity` GitHub remote
- Replaced prototype auth wiring with `next-auth` session plumbing
- Replaced the Anthropic tutor route with an OpenAI-based route
- Added Drizzle ORM, PostgreSQL config, schema files, and initial migration output
- Added a server-side practice questions API with a mock fallback until the database is seeded
- Verified the refactored app with `npm run lint` and `npm run build`
- Created the `aced` PostgreSQL database on the VPS
- Created the dedicated `aced_app` database role
- Added the local `DATABASE_URL` and `AUTH_SECRET` env foundation
- Applied the initial Drizzle migration to the live `aced` database
- Verified that the expected tables exist in the live database
- Set up the self-hosted GitHub Actions runner on the VPS
- Added the first GitHub Actions deployment workflow for automatic VPS deploys
- Deployed the app to the VPS under PM2 as `aced-web`
- Verified the app is serving from the VPS on internal port `3005`
- Added a dedicated `/api/health` endpoint and deploy health checks
- Simplified the GitHub Actions workflow to rely on the VPS-installed Node runtime for better runner stability
- Added the first Phase 2 adaptive schema tables:
  - `question_exposures`
  - `topic_skill_state`
  - `ai_tutor_profiles`
- Added adaptive question selection logic with repeat avoidance preferences
- Added answer recording and practice completion APIs
- Upgraded the tutor route to use a reusable ACT tutor persona builder
- Applied the Phase 2 schema migration to the live `aced` database
- Replaced the Gemini OpenAI-compatibility path with a native Gemini `generateContent` integration
- Added a structured ACT inventory generation pipeline that can write validated questions directly into PostgreSQL
- Added question `fingerprint` support to reduce duplicate inventory across generation runs
- Updated the practice UI and questions API to support passage-backed Reading and Science items
- Updated the VPS deploy script to run Drizzle migrations during deployment
- Added a lightweight admin review console at `/admin/review`
- Added admin-only APIs for reviewing questions and triggering draft generation by topic
- Added a backlog runner script for controlled Reading/Science inventory generation
- Added review metadata fields for questions so content can be published or rejected intentionally
- Added the first Phase 3 practice-test foundation:
  - shared official ACT section/full-test definitions
  - separate `Practice Tests` page scaffold
  - dashboard entry point for practice-test mode

## Decisions Made

- We will move toward production quality rather than continue as a loose prototype
- We will use OpenAI instead of Anthropic for AI features
- We will deploy to the VPS instead of a managed platform like Vercel
- We are leaning toward reusing the existing PostgreSQL service with a separate database for this project
- Local development can run on `localhost`
- Production traffic will go through the existing Caddy deployment once the new subdomain is created
- The local git remote has been repointed to the new `acedAntigravity` GitHub repository
- The VPS deploy runtime will use PM2 instead of Docker for the Next.js app process
- The GitHub Actions deploy job will run directly on the VPS self-hosted runner
- Phase 1 stack recommendation is:
  - Next.js
  - PostgreSQL
  - Drizzle ORM and Drizzle Kit migrations
  - Auth.js with Google OAuth
  - OpenAI API
  - VPS app process behind Caddy
- Phase 2 will cover:
  - AI-assisted ACT question generation
  - ACT tutor persona design
  - adaptive difficulty
  - repetition prevention
  - personalized practice progression
  - foundational adaptive tracking is now implemented
  - native Gemini tutor transport is now implemented
  - the first database-backed ACT inventory pipeline is now implemented
- Phase 3 will cover:
  - section practice tests
  - full ACT mode
  - timed test runner UX
  - section/full-test scoring reports
  - Math calculator integration

## Open Questions

- Reverse proxy details for the production domain
- Final DNS/subdomain value for public launch
- Final Caddy site block for the production host
- Production Google OAuth callback and origin entries
- ACT seed data shape and first content import path
- Phase 2 generation strategy details:
  - pure live generation vs cached hybrid generation
  - validation rules for AI-generated content
  - how aggressive difficulty adjustments should be
  - first real database-backed question inventory for each topic and difficulty band

## Next Milestones

- Establish deployment and environment conventions
- Prepare the app to run behind Caddy on the VPS
- Add Google OAuth env values and validate live sign-in
- Seed the first ACT sections, topics, and question content
- Decide the VPS app process model for production runtime
- Stand up the first CI/CD workflow from GitHub to the VPS
- Define and implement Phase 2 adaptive AI architecture
- Add question generation jobs and seed the first AI-reviewed ACT content batches
- Verify native Gemini tutor behavior in production
- Seed the first real published ACT inventory for all active topics
- Turn generation into a draft-first review flow for new content
- Backfill remaining Reading and Science topics in controlled batches
- Build the timed section-test shell for the new `Practice Tests` area

## Planned Next Phase

- Phase 2: adaptive ACT intelligence
- Reference doc: `phase-two-plan.md`
- Phase 3: ACT practice tests
- Reference doc: `phase-three-plan.md`

## Phase 1 Deliverables

- Finalized architecture and toolchain
- New GitHub remote configured
- Database and migration direction documented
- Production auth direction documented
- Deployment assumptions documented for VPS plus Caddy

## Phase 1 Scope

- Lock architecture choices for auth, database access, migrations, and deployment runtime
- Prepare the app to run locally during development and on the VPS in production
- Separate the project from the old GitHub remote
- Replace prototype-only service assumptions with production-ready conventions

## Notes

- Keep this file updated as decisions become firm so architecture, deployment, and product work stay aligned.
