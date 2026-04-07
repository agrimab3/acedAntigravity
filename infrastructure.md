# Infrastructure

## Project Identity

- Project name: `AcedAntigravity`
- Product focus: gamified ACT preparation platform
- Working repository root: `/Users/agrimab/Desktop/acedAntigravity/aced`

## Source Control

- GitHub repository: `https://github.com/agrimab3/acedAntigravity.git`
- Intended workflow:
  - develop locally
  - push to GitHub
  - deploy to VPS through CI/CD

## VPS

- Provider: Hostinger VPS
- Host IP: `69.62.73.167`
- SSH user: `root`
- SSH port: `22`
- Target app path: `/root/apps/aced`
- Server hostname observed during inspection: `srv1001519`
- Existing Caddyfile path: `/etc/caddy/Caddyfile`

## Current VPS Resource Snapshot

- Total RAM: about `15 GiB`
- Used RAM during inspection: about `6.6 GiB`
- Available RAM during inspection: about `9.0 GiB`
- Swap: `0`
- Disk on `/`: about `193 GiB` total with about `89 GiB` free

## Existing Database Service

- Existing database stack type: Docker-based PostgreSQL service
- Running container: `supabase-postgres-1`
- Image: `postgres:15-alpine`
- Host port exposure: `54322`
- Related app path: `/root/apps/media-assistant/supabase`

## Database Direction For This Project

- Preferred approach: reuse the existing PostgreSQL cluster
- Isolation strategy: create a separate database named `aced`
- Also create a dedicated database role/user for this app
- Avoid sharing the existing `media_assistant` database
- Current live database status:
  - database: `aced`
  - app role: `aced_app`
  - initial migration: applied

## Application Runtime Direction

- Frontend and backend app: Next.js
- AI provider target: OpenAI
- Database target: PostgreSQL
- Hosting target: self-hosted on the VPS
- Auth direction: Auth.js with Google OAuth
- ORM and migration direction: Drizzle ORM plus Drizzle Kit

## Development And Runtime Flow

- Local development:
  - run the app locally on `localhost`
  - use local env values during development
- Production deployment:
  - run the Next.js app on the VPS on an internal app port
  - expose the app through the existing Caddy container
  - use a new subdomain once DNS is created
  - let Caddy terminate TLS and manage SSL
  - keep the local machine as the development environment, not the production serving environment
  - current internal live app port: `3005`
  - current process manager: `pm2`

## Current Deployment Layout

- Live app root: `/root/apps/aced`
- Release directory synced by CI/CD: `/root/apps/aced/current`
- Shared production env file: `/root/apps/aced/shared/.env`
- PM2 app name: `aced-web`
- GitHub Actions runner install path: `/root/actions-runner-aced`
- GitHub Actions runner service: `actions.runner.agrimab3-acedAntigravity.srv1001519-aced.service`

## Environment Variables In Scope

- `NEXTAUTH_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## Deployment Direction

Planned pipeline:

1. Local development and verification
2. Push to GitHub
3. GitHub Actions CI/CD workflow
4. Self-hosted GitHub Actions runner on the VPS checks out the repo
5. CI/CD syncs code into `/root/apps/aced/current`
6. CI/CD installs dependencies, builds Next.js, and restarts PM2
7. CI/CD verifies `http://127.0.0.1:3005/api/health` before marking deploy successful

Planned reverse proxy model:

1. Next.js app binds to a private/local port on the VPS
2. Caddy routes the public subdomain to that app port
3. Caddy handles HTTPS certificates and renewal

## GitHub Direction

- Target repo: `acedAntigravity`
- Local repo remote has been updated to the new GitHub repository
- GitHub will be the source of truth between local work and VPS deployment

## Phase 1 Stack Recommendation

- App framework: Next.js
- Database: existing VPS PostgreSQL cluster with a separate `aced` database
- ORM: Drizzle ORM
- Migrations: Drizzle Kit
- Auth: Auth.js with Google OAuth
- AI: OpenAI API
- Reverse proxy: existing Caddy container
- CI/CD target: GitHub Actions deploying to the VPS

## Implemented In Repo So Far

- `next-auth` session foundation
- Drizzle config and schema
- Initial generated SQL migration
- Initial live database provision plus migration application
- OpenAI-backed tutor route
- Server-side questions API with a mock fallback path
- `.env.example` for production env setup
- GitHub Actions deployment workflow
- VPS self-hosted runner deployment target
- PM2-based production runtime
- deploy health check endpoint and verification step
- Caddy reverse-proxy template for the final subdomain cutover

## Infrastructure Items Still To Decide

- Final subdomain value and DNS routing
- Final Caddy site block insertion into `/etc/caddy/Caddyfile`
- Production Google OAuth origin and callback entries
- Secrets management strategy on the VPS
- Backup plan for the new `aced` database
- Monitoring and log collection

## Operating Notes

- The VPS already hosts multiple apps, so all new deployment work should be conservative and isolated.
- Avoid introducing a full separate Supabase stack unless product needs clearly justify the extra resource overhead.
