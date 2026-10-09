import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type ChoiceMap = Record<"A" | "B" | "C" | "D", string>;
export type QuestionSetKind = "reading_passage" | "science_stimulus";
export type QuestionUsageScope = "practice" | "mock_reserve" | "retired";
export type PracticeTestQuestionSnapshot = {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage: string | null;
  questionSetId: string | null;
  questionSetKind: QuestionSetKind | null;
  questionSetTitle: string | null;
  questionSetContent: string | null;
  question_text: string;
  choices: ChoiceMap;
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string;
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  preferredName: text("preferred_name"),
  gradeLevel: text("grade_level"),
  actTestDate: text("act_test_date"),
  previousActScore: integer("previous_act_score"),
  hasRecommendations: boolean("has_recommendations"),
  targetActScore: integer("target_act_score"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  walkthroughCompletedAt: timestamp("walkthrough_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    providerEmail: text("provider_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_identities_provider_user_idx").on(
      table.provider,
      table.providerUserId
    ),
  ]
);



export const mockTests = pgTable(
  "mock_tests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    testDate: date("test_date").notNull(),
    actDate: date("act_date").notNull(),
    startCutoff: time("start_cutoff").default("21:00:00").notNull(),
    resultsReleaseAt: timestamp("results_release_at", { withTimezone: true }).notNull(),
    priceCents: integer("price_cents").default(200).notNull(),
    seatLimit: integer("seat_limit").default(100).notNull(),
    signupsPaused: boolean("signups_paused").default(false).notNull(),
    status: text("status").$type<"draft" | "open" | "released">().default("open").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    compositeDistribution: jsonb("composite_distribution").$type<Record<string, number>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mock_tests_slug_idx").on(table.slug),
    check(
      "mock_tests_status_allowed_ck",
      sql`${table.status} in ('draft', 'open', 'released')`
    ),
  ]
);

export type MockTestFormStatus = "draft" | "review" | "locked";

export const mockTestForms = pgTable(
  "mock_test_forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mockTestId: uuid("mock_test_id")
      .notNull()
      .references(() => mockTests.id, { onDelete: "cascade" }),
    version: text("version").default("A").notNull(),
    status: text("status").$type<MockTestFormStatus>().default("draft").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedByUserId: uuid("locked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mock_test_forms_test_version_idx").on(table.mockTestId, table.version),
    check(
      "mock_test_forms_status_allowed_ck",
      sql`${table.status} in ('draft', 'review', 'locked')`
    ),
  ]
);

export const mockRegistrations = pgTable(
  "mock_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mockTestId: uuid("mock_test_id")
      .notNull()
      .references(() => mockTests.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    timeZone: text("time_zone").notNull(),
    agreedNoRefundAt: timestamp("agreed_no_refund_at", { withTimezone: true }).notNull(),
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    startOverrideUntil: timestamp("start_override_until", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    englishScore: integer("english_score"),
    mathScore: integer("math_score"),
    readingScore: integer("reading_score"),
    scienceScore: integer("science_score"),
    composite: integer("composite"),
    percentile: integer("percentile"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mock_registrations_test_user_idx").on(table.mockTestId, table.userId),
    uniqueIndex("mock_registrations_checkout_session_idx").on(table.stripeCheckoutSessionId),
    check(
      "mock_registrations_time_zone_allowed_ck",
      sql`${table.timeZone} in (
        'America/Los_Angeles',
        'America/Denver',
        'America/Chicago',
        'America/New_York',
        'America/Anchorage',
        'Pacific/Honolulu'
      )`
    ),
  ]
);

export const mockTestSessions = pgTable(
  "mock_test_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => mockRegistrations.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => mockTestForms.id, { onDelete: "restrict" }),
    status: text("status").$type<"in_progress" | "completed">().default("in_progress").notNull(),
    currentSectionOrder: integer("current_section_order").default(0).notNull(),
    currentBreakAfter: text("current_break_after").$type<"english" | "math" | "reading">(),
    breakStartedAt: timestamp("break_started_at", { withTimezone: true }),
    breakEndsAt: timestamp("break_ends_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mock_test_sessions_registration_idx").on(table.registrationId),
    index("mock_test_sessions_form_idx").on(table.formId),
    check(
      "mock_test_sessions_status_allowed_ck",
      sql`${table.status} in ('in_progress', 'completed')`
    ),
    check(
      "mock_test_sessions_section_order_ck",
      sql`${table.currentSectionOrder} between 0 and 3`
    ),
    check(
      "mock_test_sessions_break_after_ck",
      sql`${table.currentBreakAfter} is null or ${table.currentBreakAfter} in (\'english\', \'math\', \'reading\')`
    ),
  ]
);

export const mockTestSectionRuns = pgTable(
  "mock_test_section_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => mockTestSessions.id, { onDelete: "cascade" }),
    sectionKey: text("section_key")
      .notNull()
      .references(() => actSections.key, { onDelete: "restrict" }),
    sectionOrder: integer("section_order").notNull(),
    timeLimitSeconds: integer("time_limit_seconds").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    outboxClearedAt: timestamp("outbox_cleared_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mock_test_section_runs_session_order_idx").on(table.sessionId, table.sectionOrder),
    check("mock_test_section_runs_order_ck", sql`${table.sectionOrder} between 0 and 3`),
    check("mock_test_section_runs_limit_positive_ck", sql`${table.timeLimitSeconds} > 0`),
  ]
);

export const mockTestAnswers = pgTable(
  "mock_test_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => mockTestSessions.id, { onDelete: "cascade" }),
    sectionRunId: uuid("section_run_id")
      .notNull()
      .references(() => mockTestSectionRuns.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    questionOrder: integer("question_order").notNull(),
    selectedAnswer: text("selected_answer"),
    flagged: boolean("flagged").default(false).notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    clientSequence: bigint("client_sequence", { mode: "number" }).default(0).notNull(),
    pickedAtServer: timestamp("picked_at_server", { withTimezone: true }),
    syncedLate: boolean("synced_late").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mock_test_answers_session_question_idx").on(table.sessionId, table.questionId),
    uniqueIndex("mock_test_answers_section_order_idx").on(table.sectionRunId, table.questionOrder),
    check(
      "mock_test_answers_selected_answer_ck",
      sql`${table.selectedAnswer} is null or ${table.selectedAnswer} in ('A', 'B', 'C', 'D')`
    ),
    check("mock_test_answers_question_order_positive_ck", sql`${table.questionOrder} > 0`),
  ]
);

export const mockTestTopicResults = pgTable(
  "mock_test_topic_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => mockRegistrations.id, { onDelete: "cascade" }),
    sectionKey: text("section_key")
      .notNull()
      .references(() => actSections.key, { onDelete: "restrict" }),
    topicId: uuid("topic_id").notNull(),
    topicName: text("topic_name").notNull(),
    correctCount: integer("correct_count").default(0).notNull(),
    totalCount: integer("total_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mock_test_topic_results_registration_topic_idx").on(
      table.registrationId,
      table.topicId
    ),
    index("mock_test_topic_results_registration_idx").on(table.registrationId),
    check("mock_test_topic_results_counts_ck", sql`${table.correctCount} >= 0 and ${table.totalCount} >= ${table.correctCount}`),
  ]
);

export const mockTestOpsEvents = pgTable(
  "mock_test_ops_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mockTestId: uuid("mock_test_id")
      .notNull()
      .references(() => mockTests.id, { onDelete: "cascade" }),
    registrationId: uuid("registration_id").references(() => mockRegistrations.id, {
      onDelete: "set null",
    }),
    sessionId: uuid("session_id").references(() => mockTestSessions.id, {
      onDelete: "set null",
    }),
    sectionKey: text("section_key"),
    kind: text("kind").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("mock_test_ops_events_test_created_idx").on(table.mockTestId, table.createdAt),
    index("mock_test_ops_events_registration_idx").on(table.registrationId),
    index("mock_test_ops_events_kind_idx").on(table.kind),
  ]
);

export const mockTestClientPresence = pgTable(
  "mock_test_client_presence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => mockRegistrations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => mockTestSessions.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mock_test_client_presence_registration_client_idx").on(
      table.registrationId,
      table.clientId
    ),
    index("mock_test_client_presence_last_seen_idx").on(table.lastSeenAt),
    index("mock_test_client_presence_registration_idx").on(table.registrationId),
  ]
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminEmail: text("admin_email").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("admin_audit_log_created_at_idx").on(table.createdAt),
    index("admin_audit_log_action_idx").on(table.action),
    index("admin_audit_log_admin_email_idx").on(table.adminEmail),
  ]
);

export const mockWaitlist = pgTable(
  "mock_waitlist",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mockTestId: uuid("mock_test_id")
      .notNull()
      .references(() => mockTests.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    inviteToken: text("invite_token"),
    inviteUsedAt: timestamp("invite_used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("mock_waitlist_test_email_idx").on(table.mockTestId, table.email),
    uniqueIndex("mock_waitlist_invite_token_idx").on(table.inviteToken),
  ]
);

export const actSections = pgTable("act_sections", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  constellation: text("constellation").notNull(),
  displayOrder: integer("display_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const actTopics = pgTable(
  "act_topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionKey: text("section_key")
      .notNull()
      .references(() => actSections.key, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("act_topics_section_slug_idx").on(table.sectionKey, table.slug),
    uniqueIndex("act_topics_section_name_idx").on(table.sectionKey, table.name),
  ]
);

export const questionSets = pgTable(
  "question_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionKey: text("section_key")
      .notNull()
      .references(() => actSections.key, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => actTopics.id, { onDelete: "cascade" }),
    kind: text("kind").$type<QuestionSetKind>().notNull(),
    title: text("title"),
    content: text("content").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("question_sets_section_idx").on(table.sectionKey),
    index("question_sets_topic_idx").on(table.topicId),
    check(
      "question_sets_section_allowed_ck",
      sql`${table.sectionKey} in ('reading', 'science')`
    ),
    check(
      "question_sets_kind_allowed_ck",
      sql`${table.kind} in ('reading_passage', 'science_stimulus')`
    ),
  ]
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionKey: text("section_key")
      .notNull()
      .references(() => actSections.key, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => actTopics.id, { onDelete: "cascade" }),
    questionSetId: uuid("question_set_id").references(() => questionSets.id, {
      onDelete: "set null",
    }),
    difficulty: text("difficulty").default("medium").notNull(),
    questionType: text("question_type").default("multiple_choice").notNull(),
    prompt: text("prompt").notNull(),
    passage: text("passage"),
    fingerprint: text("fingerprint"),
    choices: jsonb("choices").$type<ChoiceMap>().notNull(),
    correctAnswer: text("correct_answer").notNull(),
    explanation: text("explanation").notNull(),
    source: text("source").default("internal").notNull(),
    generationModel: text("generation_model"),
    usageScope: text("usage_scope")
      .$type<QuestionUsageScope>()
      .default("practice")
      .notNull(),
    status: text("status").default("draft").notNull(),
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("questions_fingerprint_idx").on(table.fingerprint),
    index("questions_question_set_idx").on(table.questionSetId),
    index("questions_usage_scope_idx").on(table.usageScope),
    index("questions_scope_status_section_idx").on(
      table.usageScope,
      table.status,
      table.sectionKey
    ),
    check(
      "questions_usage_scope_allowed_ck",
      sql`${table.usageScope} in (\'practice\', \'mock_reserve\', \'retired\')`
    ),
  ]
);

export const mockTestFormQuestions = pgTable(
  "mock_test_form_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formId: uuid("form_id")
      .notNull()
      .references(() => mockTestForms.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    sectionKey: text("section_key")
      .notNull()
      .references(() => actSections.key, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    correctAnswerSnapshot: text("correct_answer_snapshot").notNull(),
    topicIdSnapshot: uuid("topic_id_snapshot").notNull(),
    topicNameSnapshot: text("topic_name_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mock_test_form_question_once_idx").on(table.questionId),
    uniqueIndex("mock_test_form_section_position_idx").on(
      table.formId,
      table.sectionKey,
      table.position
    ),
    index("mock_test_form_questions_form_idx").on(table.formId),
    check(
      "mock_test_form_questions_section_allowed_ck",
      sql`${table.sectionKey} in ('english', 'math', 'reading', 'science')`
    ),
    check("mock_test_form_questions_position_positive_ck", sql`${table.position} > 0`),
  ]
);

/**
 * Internal-only evidence for content-generation runs. Rows in this table are
 * never used by question-serving queries; rejected candidates remain auditable
 * without becoming serveable questions.
 */
export const questionGenerationAudits = pgTable(
  "question_generation_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").notNull(),
    candidateId: uuid("candidate_id").notNull(),
    sectionKey: text("section_key").notNull(),
    topicId: uuid("topic_id").references(() => actTopics.id, { onDelete: "set null" }),
    topicName: text("topic_name").notNull(),
    requestedDifficulty: text("requested_difficulty").notNull(),
    generatedDifficulty: text("generated_difficulty"),
    passage: text("passage"),
    prompt: text("prompt"),
    choices: jsonb("choices"),
    correctAnswer: text("correct_answer"),
    explanation: text("explanation"),
    generationProvider: text("generation_provider"),
    generationModel: text("generation_model"),
    generationAttempt: integer("generation_attempt").default(1).notNull(),
    deterministicFindings: jsonb("deterministic_findings"),
    blockingFlags: jsonb("blocking_flags"),
    warningFlags: jsonb("warning_flags"),
    primaryReviewerResult: jsonb("primary_reviewer_result"),
    verifierResult: jsonb("verifier_result"),
    providerAttempts: jsonb("provider_attempts"),
    parserSchemaErrors: jsonb("parser_schema_errors"),
    finalDisposition: text("final_disposition").notNull(),
    finalReason: text("final_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("question_generation_audits_run_idx").on(table.runId),
    index("question_generation_audits_candidate_idx").on(table.candidateId),
    index("question_generation_audits_topic_idx").on(table.topicId),
  ]
);

export const questionExposures = pgTable(
  "question_exposures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    timesSeen: integer("times_seen").default(0).notNull(),
    timesCorrect: integer("times_correct").default(0).notNull(),
    timesIncorrect: integer("times_incorrect").default(0).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastAnsweredAt: timestamp("last_answered_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("question_exposures_user_question_idx").on(table.userId, table.questionId)]
);

export const topicSkillState = pgTable(
  "topic_skill_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => actTopics.id, { onDelete: "cascade" }),
    currentDifficulty: text("current_difficulty").default("easy").notNull(),
    recommendedDifficulty: text("recommended_difficulty").default("easy").notNull(),
    recentAccuracyPct: integer("recent_accuracy_pct").default(0).notNull(),
    rollingAccuracyPct: integer("rolling_accuracy_pct").default(0).notNull(),
    averageTimeSpentSeconds: integer("average_time_spent_seconds").default(0).notNull(),
    totalAnswered: integer("total_answered").default(0).notNull(),
    totalCorrect: integer("total_correct").default(0).notNull(),
    hintsUsed: integer("hints_used").default(0).notNull(),
    correctStreak: integer("correct_streak").default(0).notNull(),
    incorrectStreak: integer("incorrect_streak").default(0).notNull(),
    lastAnsweredAt: timestamp("last_answered_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("topic_skill_state_user_topic_idx").on(table.userId, table.topicId)]
);

export const aiTutorProfiles = pgTable(
  "ai_tutor_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    version: integer("version").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    systemPrompt: text("system_prompt").notNull(),
    hintPolicy: text("hint_policy"),
    reviewPolicy: text("review_policy"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("ai_tutor_profiles_slug_idx").on(table.slug)]
);

export const practiceSessions = pgTable("practice_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sectionKey: text("section_key")
    .notNull()
    .references(() => actSections.key, { onDelete: "cascade" }),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => actTopics.id, { onDelete: "cascade" }),
  questionCount: integer("question_count").default(0).notNull(),
  correctCount: integer("correct_count").default(0).notNull(),
  accuracyPct: integer("accuracy_pct").default(0).notNull(),
  durationSeconds: integer("duration_seconds").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const practiceAnswers = pgTable("practice_answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => practiceSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  selectedAnswer: text("selected_answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  timeSpentSeconds: integer("time_spent_seconds").default(0).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
});

export const topicMastery = pgTable(
  "topic_mastery",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => actTopics.id, { onDelete: "cascade" }),
    correctCount: integer("correct_count").default(0).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    masteryPct: integer("mastery_pct").default(0).notNull(),
    lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("topic_mastery_user_topic_idx").on(table.userId, table.topicId)]
);

export const practiceTestSessions = pgTable("practice_test_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  modeKey: text("mode_key").notNull(),
  format: text("format").notNull(),
  status: text("status").default("in_progress").notNull(),
  scienceIncluded: boolean("science_included").default(false).notNull(),
  totalQuestionCount: integer("total_question_count").default(0).notNull(),
  answeredCount: integer("answered_count").default(0).notNull(),
  correctCount: integer("correct_count").default(0).notNull(),
  accuracyPct: integer("accuracy_pct").default(0).notNull(),
  compositeEstimatedScore: integer("composite_estimated_score"),
  durationSeconds: integer("duration_seconds").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const practiceTestSections = pgTable(
  "practice_test_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => practiceTestSessions.id, { onDelete: "cascade" }),
    sectionKey: text("section_key")
      .notNull()
      .references(() => actSections.key, { onDelete: "cascade" }),
    sectionOrder: integer("section_order").notNull(),
    title: text("title").notNull(),
    questionCount: integer("question_count").default(0).notNull(),
    answeredCount: integer("answered_count").default(0).notNull(),
    correctCount: integer("correct_count").default(0).notNull(),
    accuracyPct: integer("accuracy_pct").default(0).notNull(),
    estimatedScore: integer("estimated_score"),
    timeLimitSeconds: integer("time_limit_seconds").default(0).notNull(),
    durationSeconds: integer("duration_seconds").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("practice_test_sections_session_order_idx").on(table.sessionId, table.sectionOrder)]
);

export const practiceTestAnswers = pgTable(
  "practice_test_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => practiceTestSessions.id, { onDelete: "cascade" }),
    sectionRunId: uuid("section_run_id")
      .notNull()
      .references(() => practiceTestSections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").references(() => questions.id, { onDelete: "set null" }),
    questionOrder: integer("question_order").notNull(),
    topicName: text("topic_name").notNull(),
    selectedAnswer: text("selected_answer"),
    correctAnswer: text("correct_answer").notNull(),
    isCorrect: boolean("is_correct"),
    flagged: boolean("flagged").default(false).notNull(),
    timeSpentSeconds: integer("time_spent_seconds").default(0).notNull(),
    questionSnapshot: jsonb("question_snapshot").$type<PracticeTestQuestionSnapshot>().notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("practice_test_answers_section_question_order_idx").on(table.sectionRunId, table.questionOrder)]
);
