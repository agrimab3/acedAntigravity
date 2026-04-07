# Phase 1 Plan

## Objective

Establish the production foundation for `AcedAntigravity` before feature implementation begins.

## Agreed Deployment Model

- Build locally
- Test locally on `localhost`
- Push code to GitHub
- Deploy from GitHub to the VPS
- Serve the live app from the VPS
- Use Caddy for reverse proxy and SSL once the subdomain and DNS are ready

## Recommended Stack

- Next.js for the application
- PostgreSQL for the database
- Drizzle ORM for schema and queries
- Drizzle Kit for migrations
- Auth.js for authentication
- Google OAuth as the initial login provider
- OpenAI API for tutoring and AI features
- Caddy for HTTPS and reverse proxy

## Why This Stack

- It keeps infrastructure light on a VPS that already hosts several services
- It avoids standing up a full new Supabase stack
- It gives us versioned schema control and cleaner production migrations
- It supports future monetization without overcomplicating the first release

## Phase 1 Workstreams

### 1. Repository and Delivery

- Move fully onto the new GitHub repo
- Define the branch and deploy conventions
- Prepare for GitHub Actions based deployment

### 2. Database Foundation

- Create the `aced` database
- Create a dedicated app user
- Add versioned migrations
- Seed ACT sections and core topics

### 3. Auth Foundation

- Replace prototype Supabase-auth assumptions
- Set up Auth.js with Google OAuth
- Define user, identity, and session models

### 4. App Runtime Foundation

- Define production env vars
- Define the VPS app port
- Define build and start commands
- Prepare Caddy routing once DNS is ready

### 5. AI Foundation

- Replace Anthropic assumptions with OpenAI-compatible abstractions
- Keep AI integration server-side
- Keep prompts and model selection configurable

## What Is Explicitly Not In Phase 1

- Final UI polish
- Advanced analytics
- Billing implementation
- Full question authoring workflow
- Social-media-ready marketing pages

## Exit Criteria

Phase 1 is complete when:

- the architecture choices are final
- the repo is aligned to the new GitHub source of truth
- the database plan is implementation-ready
- the auth direction is implementation-ready
- the deployment model for VPS plus Caddy is fully defined
