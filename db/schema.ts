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
  choices: jsonb("choices").$type<ChoiceMap>().notNull(),
  correctAnswer: text("correct_answer").notNull(),
  explanation: text("explanation").notNull(),
  source: text("source").default("internal").notNull(),
  status: text("status").default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
