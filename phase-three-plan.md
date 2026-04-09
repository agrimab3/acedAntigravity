# Phase 3 Plan

## Objective

Build Aced's official ACT-style practice test experience:

- section practice tests with official timing and question counts
- a full-test mode with optional Science
- realistic pacing, navigation, and submission flow
- post-test score reporting tied back to constellation stars
- Math-specific calculator support, with Desmos as the preferred long-term calculator experience

## Product Direction

Phase 3 should make Aced feel like both:

- a smart daily practice coach
- a realistic ACT rehearsal environment

Students should be able to switch between:

- targeted skill practice
- full timed performance mode

without leaving the Aced universe.

## Official Test Shapes

### Section Tests

- English: `50 questions / 35 minutes`
- Math: `45 questions / 50 minutes`
- Reading: `36 questions / 40 minutes`
- Science: `40 questions / 40 minutes`

### Full Tests

- Full ACT with Science: `171 questions / 165 minutes`
- Core ACT without Science: `131 questions / 125 minutes`

## Core Recommendation

Build section tests first.

Why:

- faster to validate the timer + nav + review shell
- easier to check content sufficiency section by section
- lets us ship something meaningful before the full orchestration layer
- reduces complexity before breaks, multi-section transitions, and full-test score aggregation

## Practice Test Modes

### 1. Section Test

Purpose:

- rehearse one official ACT section under real timing

Expected UX:

- launch card
- readiness screen
- full-screen timed section shell
- answer grid / flagged question nav
- submit + section report

### 2. Full ACT

Purpose:

- simulate the real multi-section experience

Expected UX:

- section transitions
- optional break handling
- optional Science inclusion
- final report with section breakdown + composite estimate

## Math Calculator Direction

Preferred long-term direction:

- integrate a built-in graphing calculator for Math
- use Desmos if technically feasible and visually clean

Product rule:

- calculator appears only during Math
- no calculator UI during English, Reading, or Science

## Score And Review Direction

Each completed test should produce:

- raw score
- estimated scaled score out of `36`
- pacing summary
- hardest stretch or section slowdown
- topic/subtopic breakdown
- missed questions mapped back to constellation stars

## Aced-Specific Differentiators

After a test, Aced should translate performance into action:

- `rebuild these stars`
- `drill these 3 skills`
- `retry this section`
- `take another full test`

This is what makes Aced better than a plain stopwatch.

## Phase 3A Scope

- add a dedicated `Practice Tests` area
- define section/full test mode metadata
- build launcher UI for section and full test modes
- establish the product shell and navigation entry point

## Phase 3B Scope

- build the timed section-test runner
- support question navigation and flagging
- add auto-submit on time expiration
- store test session results
- add section report/review screens with missed-question analysis

## Phase 3C Scope

- build the multi-section full ACT runner
- add break/transition handling
- add final test reporting
- add Math calculator integration
- sync completed practice-test results back into Aced's main ACT score model

## Future Stretch

- adaptive practice test recommendations
- official-feeling warm-up routine
- difficulty-aware retest generation
- test history timeline
- score trend over time

## Current Status

Phase 3B/3C foundation is now live:

1. timed runner works for section and full-test modes
2. practice-test sessions/results persist in PostgreSQL
3. report screens include missed-skill and missed-question review
4. Math sections can open Desmos inside the runner
5. completed timed tests now influence the main dashboard ACT estimates
6. practice-test history and pacing analytics are now live

## Immediate Next Step

Refine the practice-test system into a fuller performance layer:

1. keep calibrating score mapping against ACT-style performance
2. expand remediation plans from report -> targeted star practice
3. add deeper history drilldowns and test retake flows
4. keep strengthening real question-bank quality across all active stars
