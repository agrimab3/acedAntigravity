# Database Schema Plan

## Goal

Design a production-ready database structure for `AcedAntigravity` using the existing PostgreSQL service on the VPS while keeping this project isolated from other apps.

## Recommended Tooling

- Database: PostgreSQL 15
- ORM: Drizzle ORM
- Migration tool: Drizzle Kit
- Runtime access: app-specific PostgreSQL user with least privilege needed for normal operation
- Deployment-time schema changes: versioned migrations run by the deployment pipeline

## Recommended Isolation Strategy

- Create a separate database named `aced`
- Create a dedicated database role for the app
- Keep migrations and credentials separate from the existing `media_assistant` database

This is preferred over sharing the same database with a separate schema because it gives cleaner isolation for permissions, backups, migrations, and future maintenance.

## Current VPS Database Context

- Existing PostgreSQL container: `supabase-postgres-1`
- PostgreSQL version observed: `15.14`
- Existing app database observed: `media_assistant`
- Reuse plan: add a separate `aced` database rather than deploying another full database stack

## Proposed High-Level Data Domains

- Users
- Authentication identities and sessions
- ACT content
- Practice sessions
- Responses and mastery tracking
- AI tutoring interactions
- Subscription and billing readiness
- Admin and content management

## Proposed Core Tables

### `users`

Purpose:
Store the canonical app user profile.

Likely fields:
- `id`
- `email`
- `display_name`
- `avatar_url`
- `grade_level`
- `target_act_score`
- `created_at`
- `updated_at`

### `user_identities`

Purpose:
Map app users to login providers such as Google.

Likely fields:
- `id`
- `user_id`
- `provider`
- `provider_user_id`
- `created_at`

### `sessions`

Purpose:
Track authenticated web sessions if we use app-managed auth.

Likely fields:
- `id`
- `user_id`
- `expires_at`
- `created_at`
- `last_seen_at`

### `act_sections`

Purpose:
Normalize ACT sections.

Likely values:
- `english`
- `math`
- `reading`
- `science`

### `act_topics`

Purpose:
Store the topic map shown on the constellation dashboard.

Likely fields:
- `id`
- `section_key`
- `slug`
- `name`
- `display_order`
- `constellation_label`
- `is_active`

### `questions`

Purpose:
Store ACT practice questions.

Likely fields:
- `id`
- `section_key`
- `topic_id`
- `difficulty`
- `question_type`
- `prompt`
- `passage`
- `choices_json`
- `correct_answer`
- `explanation`
- `source`
- `status`
- `created_at`
- `updated_at`

### `practice_sessions`

Purpose:
Track a user practice run for a section or topic.

Likely fields:
- `id`
- `user_id`
- `section_key`
- `topic_id`
- `started_at`
- `completed_at`
- `question_count`
- `correct_count`
- `accuracy_pct`
- `duration_seconds`

### `practice_answers`

Purpose:
Track each question attempt inside a session.

Likely fields:
- `id`
- `session_id`
- `user_id`
- `question_id`
- `selected_answer`
- `is_correct`
- `time_spent_seconds`
- `submitted_at`

### `topic_mastery`

Purpose:
Store rollup mastery by user and topic for fast dashboard reads.

Likely fields:
- `id`
- `user_id`
- `topic_id`
- `correct_count`
- `attempt_count`
- `mastery_pct`
- `last_practiced_at`
- `updated_at`

### `ai_tutor_messages`

Purpose:
Store tutor interactions for support, analytics, and replay.

Likely fields:
- `id`
- `user_id`
- `session_id`
- `question_id`
- `role`
- `message_text`
- `model`
- `created_at`

### `subscriptions`

Purpose:
Keep the schema ready for monetization later.

Likely fields:
- `id`
- `user_id`
- `provider`
- `provider_customer_id`
- `provider_subscription_id`
- `plan_key`
- `status`
- `current_period_end`
- `created_at`
- `updated_at`

## Schema Design Principles

- Use UUID primary keys
- Use timestamps on all mutable domain tables
- Normalize sections and topics
- Keep practice event data separate from mastery rollups
- Prefer append-only answer history where practical
- Keep AI logs bounded and retention-aware

## Migration Approach

- Use a proper migration tool instead of ad hoc SQL
- Keep schema changes versioned in the repo
- Apply migrations in staging before production
- Seed canonical ACT sections and topics through repeatable scripts
- Use a dedicated `aced` database user rather than reusing the current superuser long-term

## Initial Database Foundation Plan

### Step 1

Create a new PostgreSQL database:

- database name: `aced`

Status:

- Complete

### Step 2

Create a dedicated database role for the application:

- app role: `aced_app`
- use a strong generated password stored only in VPS secrets

Status:

- Complete

### Step 3

Grant the app role access only to the `aced` database and its owned objects.

Status:

- Complete

### Step 4

Create the initial migration set with:

- extensions needed for UUID generation if required by the chosen schema
- base tables for users, identities, sessions, sections, topics, questions, practice sessions, practice answers, and topic mastery
- indexes for common dashboard and practice queries
- seed data for ACT sections and baseline topics

Status:

- Initial Drizzle schema created in `db/schema.ts`
- Initial migration scaffold generated in `drizzle/0000_violet_madripoor.sql`
- Initial migration applied successfully to the live `aced` database

### Step 5

Separate migration concerns:

- deployment role can apply migrations
- runtime app role uses the already-created schema

This keeps the app process from needing broad admin rights in day-to-day operation.

## Initial Query Patterns To Design For

- fetch topics by ACT section for dashboard display
- fetch topic mastery for a user
- fetch a question set for a section and topic
- write a practice answer quickly
- roll up mastery by topic and by section
- retrieve recent practice session history

## Questions To Finalize Before Implementation

- Which auth library will we use
- Whether question content is managed manually, AI-assisted, or both
- Whether we need passage tables for reading/science content
- Whether billing is phase 1 or just future-ready
- Whether we want soft-delete fields for admin workflows

## Implementation Direction

- Start with a minimal production schema for auth, questions, practice sessions, answers, and mastery
- Add AI tutor logging and subscriptions after the main product loop is stable
