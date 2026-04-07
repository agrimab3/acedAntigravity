# Phase 2 Plan

## Objective

Build the adaptive ACT intelligence layer for `AcedAntigravity`:

- AI-assisted ACT question generation
- a strong in-app ACT tutor persona
- personalized difficulty adjustment
- content reuse controls to reduce repetition
- data feedback loops that improve the experience over time

## Product Direction

Phase 2 should make the app feel like a true ACT coach, not just a quiz app with chat.

The goal is:

- every student gets questions that feel relevant to their current skill level
- the tutor explains concepts like an ACT expert who is supportive and strategic
- the system adapts difficulty in response to performance
- users avoid seeing the same exact questions too often

## Core Recommendation

Do not rely on fully on-the-fly question generation for every prompt.

Instead, use a hybrid system:

1. Generate and store question inventory ahead of use or just-in-time in batches
2. Track which questions each user has seen
3. Select from unused or low-frequency questions first
4. Use AI live for tutoring, explanation, hinting, and occasional content expansion
5. Regenerate more content when inventory for a topic or difficulty band gets low

Why:

- it reduces latency
- it lowers cost
- it makes quality control easier
- it reduces accidental duplicates
- it gives us room for review and moderation

## ACT Tutor Persona

### Persona Goal

The in-app AI should behave like an ACT specialist who is:

- highly accurate
- encouraging but not cheesy
- strategic about test prep
- strong at diagnosing skill gaps
- aware of ACT structure and pacing
- able to simplify without dumbing down

### Persona Traits

- Speaks clearly and confidently
- Gives short explanations first, then deeper follow-up when asked
- Focuses on the reasoning pattern behind the answer
- Explains why wrong choices are wrong, not just why the right one is right
- Adjusts tone to student confidence and performance
- Tracks whether the user needs confidence-building, remediation, or challenge

### Persona Responsibilities

- Teach the concept
- Identify likely misconceptions
- Give hints without immediately spoiling the answer
- Calibrate next-step difficulty
- Encourage good test-taking habits like pacing, elimination, and pattern recognition

### Persona Boundaries

- Must not hallucinate ACT facts or scoring claims
- Must not produce low-quality or trick questions that do not resemble ACT style
- Must not overpraise weak performance in a misleading way
- Must not reveal answers before the student has engaged unless explicitly in review mode

## Adaptive Difficulty System

## Goal

Move each student toward the edge of productive struggle:

- not too easy
- not too hard
- always informative

## Proposed Difficulty Bands

- `foundation`
- `easy`
- `medium`
- `hard`
- `challenge`

These are internal bands for our platform. They do not need to be shown directly to the user.

## Initial Placement Strategy

For a new topic:

- start at `easy` or `medium` based on onboarding confidence or prior section mastery
- if no prior data exists, default to `easy` for first exposure

## Adjustment Rules

Suggested first pass:

- 2 to 3 correct in a row with healthy response time:
  - move up one band
- repeated misses or very slow confident misses:
  - move down one band
- mixed performance:
  - stay in current band and gather more evidence

Also consider:

- correctness
- time spent
- hint usage
- repeated misconception patterns

## Mastery Interpretation

Per topic, maintain:

- recent accuracy
- rolling accuracy window
- average response time
- hint frequency
- streak direction
- question exposure count

The system should adapt based on recent behavior more heavily than historical totals.

## Question Generation Strategy

## Generation Inputs

When generating questions, feed the model:

- ACT section
- ACT topic
- target difficulty band
- student mastery band
- recent misconception type if known
- required format constraints
- anti-duplication instruction

## Output Requirements

Each generated question should include:

- section
- topic
- difficulty band
- ACT-style prompt
- answer choices
- correct answer
- explanation
- rationale for wrong choices
- optional concept tags
- optional misconception tags

## Quality Controls

Every generated question should pass validation for:

- valid JSON structure
- exactly four choices when applicable
- one unambiguous correct answer
- explanation present
- topic match
- no duplicated answer choices
- no obvious malformed text

## Recommended Generation Modes

- `batch generation`:
  create inventory for topics and difficulty bands ahead of use
- `just-in-time top-up`:
  generate more when a topic inventory drops below threshold
- `targeted remediation generation`:
  generate questions focused on a known misconception

## Repetition Prevention

We should track:

- questions shown to user
- questions answered correctly
- questions answered incorrectly
- last seen timestamp
- frequency seen
- semantic similarity group if we later add near-duplicate detection

Selection rules:

- avoid exact repeats unless the user enters review mode
- avoid near-duplicate prompts in the same short session
- prefer unseen questions in the user’s current target band
- allow strategic resurfacing of missed concepts after a delay

## Data Model Expansion For Phase 2

Likely new tables or fields:

### `question_generation_jobs`

Purpose:
Track AI content generation batches and outcomes.

### `question_exposures`

Purpose:
Track which user has seen which question and when.

### `question_tags`

Purpose:
Store fine-grained concept and misconception tags.

### `ai_tutor_profiles`

Purpose:
Version persona and prompt configuration over time.

### `topic_skill_state`

Purpose:
Store rolling adaptive difficulty and mastery state for each user-topic pair.

## Phase 2 Workstreams

### 1. Tutor Persona Design

- write the system prompt and tone rules
- define remediation, coaching, and review modes
- define hinting policy
- status:
  - reusable persona builder implemented in `lib/tutor-profile.ts`

### 2. Content Generation Pipeline

- add generation prompt templates
- add response validation
- add DB persistence for generated content
- add batch generation scripts or admin endpoints
- status:
  - still pending

### 3. Adaptive Engine

- define scoring heuristics
- add per-user topic state
- implement difficulty movement rules
- integrate question selection logic
- status:
  - first pass implemented with `topic_skill_state`, adaptive band selection, and answer recording APIs

### 4. Anti-Repetition Layer

- track question exposures
- status:
  - first pass implemented with `question_exposures`
- bias toward unseen questions
- schedule spaced review for missed questions

### 5. Analytics and Monitoring

- monitor generation quality
- monitor duplicate rate
- monitor tutor performance and cost
- review failure cases

## What Should Not Happen In Phase 2

- blind trust in raw AI question output without validation
- difficulty changes based only on one answer
- hidden logic so complex that it becomes impossible to debug
- uncontrolled token usage for every practice interaction

## Exit Criteria

Phase 2 is complete when:

- the ACT tutor persona is defined and implemented
- question generation can create valid ACT-style inventory by section, topic, and difficulty
- adaptive difficulty changes based on user performance
- repeat exposure is controlled
- the database supports generated content and exposure tracking
- the experience feels personalized rather than static
