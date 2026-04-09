import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type ChoiceMap = Record<"A" | "B" | "C" | "D", string>;
export type PracticeTestQuestionSnapshot = {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage: string | null;
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
  gradeLevel: text("grade_level"),
  targetActScore: integer("target_act_score"),
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

export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sectionKey: text("section_key")
    .notNull()
    .references(() => actSections.key, { onDelete: "cascade" }),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => actTopics.id, { onDelete: "cascade" }),
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
  status: text("status").default("draft").notNull(),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
},
  (table) => [uniqueIndex("questions_fingerprint_idx").on(table.fingerprint)]
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
