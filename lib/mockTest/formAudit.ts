import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  actTopics,
  mockTestFormQuestions,
  mockTestForms,
  mockTests,
  questionExposures,
  questionSets,
  questions,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { resolveEffectivePassage } from "@/lib/question-sets";
import { reviewQuestionQuality } from "@/lib/question-utils";

const REQUIRED_COUNTS = { english: 50, math: 45, reading: 36, science: 40 } as const;
const SECTION_ORDER = ["english", "math", "reading", "science"] as const;

export type MockFormAudit = {
  form: {
    id: string;
    version: string;
    status: string;
    slug: string;
    testDate: string;
    reviewedAt: Date | null;
    lockedAt: Date | null;
  };
  pass: boolean;
  totalQuestions: number;
  checks: Array<{ code: string; pass: boolean; message: string }>;
  sectionSummaries: Array<{
    sectionKey: string;
    count: number;
    expected: number;
    difficulty: Record<string, number>;
    topics: Record<string, number>;
    setCount: number;
  }>;
  questions: Array<{
    id: string;
    sectionKey: string;
    position: number;
    topicName: string;
    difficulty: string;
    questionSetId: string | null;
    prompt: string;
    qualityClean: boolean;
    exposureCount: number;
  }>;
};

export async function getMockFormAudit(formId: string): Promise<MockFormAudit | null> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");

  const [form] = await db
    .select({
      id: mockTestForms.id,
      version: mockTestForms.version,
      status: mockTestForms.status,
      reviewedAt: mockTestForms.reviewedAt,
      lockedAt: mockTestForms.lockedAt,
      slug: mockTests.slug,
      testDate: mockTests.testDate,
    })
    .from(mockTestForms)
    .innerJoin(mockTests, eq(mockTestForms.mockTestId, mockTests.id))
    .where(eq(mockTestForms.id, formId))
    .limit(1);

  if (!form) return null;

  const rows = await db
    .select({
      id: questions.id,
      assignmentSectionKey: mockTestFormQuestions.sectionKey,
      questionSectionKey: questions.sectionKey,
      position: mockTestFormQuestions.position,
      correctAnswerSnapshot: mockTestFormQuestions.correctAnswerSnapshot,
      topicIdSnapshot: mockTestFormQuestions.topicIdSnapshot,
      topicNameSnapshot: mockTestFormQuestions.topicNameSnapshot,
      usageScope: questions.usageScope,
      status: questions.status,
      difficulty: questions.difficulty,
      topicId: questions.topicId,
      topicName: actTopics.name,
      topicActive: actTopics.isActive,
      questionSetId: questions.questionSetId,
      questionSetContent: questionSets.content,
      passage: questions.passage,
      prompt: questions.prompt,
      choices: questions.choices,
      correctAnswer: questions.correctAnswer,
      explanation: questions.explanation,
    })
    .from(mockTestFormQuestions)
    .innerJoin(questions, eq(mockTestFormQuestions.questionId, questions.id))
    .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
    .leftJoin(questionSets, eq(questions.questionSetId, questionSets.id))
    .where(eq(mockTestFormQuestions.formId, formId))
    .orderBy(asc(mockTestFormQuestions.sectionKey), asc(mockTestFormQuestions.position));

  const questionIds = rows.map((row) => row.id);
  const exposures = questionIds.length
    ? await db
        .select({ questionId: questionExposures.questionId })
        .from(questionExposures)
        .where(inArray(questionExposures.questionId, questionIds))
    : [];
  const exposureCounts = exposures.reduce((map, row) => {
    map.set(row.questionId, (map.get(row.questionId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const checks: MockFormAudit["checks"] = [];
  const push = (code: string, pass: boolean, message: string) => checks.push({ code, pass, message });

  push("total-count", rows.length === 171, `Form has ${rows.length}/171 questions.`);

  const seenIds = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    if (seenIds.has(row.id)) duplicates += 1;
    seenIds.add(row.id);
  }
  push("no-duplicate-questions", duplicates === 0, duplicates === 0 ? "No duplicate question assignments." : `${duplicates} duplicate assignment(s) found.`);

  let allReserve = true;
  let allPublished = true;
  let allUnexposed = true;
  let allSectionMatched = true;
  let allTopicsActive = true;
  let allQualityClean = true;
  let allSnapshotsMatch = true;
  let englishMathSetFree = true;
  let readingScienceSetBacked = true;

  const questionAuditRows: MockFormAudit["questions"] = rows.map((row) => {
    const exposureCount = exposureCounts.get(row.id) ?? 0;
    const review = reviewQuestionQuality({
      id: row.id,
      section: row.questionSectionKey,
      topic: row.topicName,
      difficulty: row.difficulty,
      passage: resolveEffectivePassage({
        passage: row.passage,
        questionSetContent: row.questionSetContent,
      }),
      question_text: row.prompt,
      choices: row.choices,
      correct_answer: row.correctAnswer,
      explanation: row.explanation,
    });
    const qualityClean =
      review.shouldServe &&
      review.blockingFlags.length === 0 &&
      review.warningFlags.length === 0;

    allReserve &&= row.usageScope === "mock_reserve";
    allPublished &&= row.status === "published";
    allUnexposed &&= exposureCount === 0;
    allSectionMatched &&= row.assignmentSectionKey === row.questionSectionKey;
    allTopicsActive &&= row.topicActive;
    allQualityClean &&= qualityClean;
    allSnapshotsMatch &&=
      row.correctAnswerSnapshot === row.correctAnswer &&
      row.topicIdSnapshot === row.topicId &&
      row.topicNameSnapshot === row.topicName;

    if (row.assignmentSectionKey === "english" || row.assignmentSectionKey === "math") {
      englishMathSetFree &&= row.questionSetId === null;
    } else {
      readingScienceSetBacked &&= row.questionSetId !== null;
    }

    return {
      id: row.id,
      sectionKey: row.assignmentSectionKey,
      position: row.position,
      topicName: row.topicName,
      difficulty: row.difficulty,
      questionSetId: row.questionSetId,
      prompt: row.prompt,
      qualityClean,
      exposureCount,
    };
  });

  push("reserve-only", allReserve, allReserve ? "Every question is mock_reserve." : "At least one question is not mock_reserve.");
  push("published-only", allPublished, allPublished ? "Every question is published." : "At least one question is not published.");
  push("zero-exposures", allUnexposed, allUnexposed ? "Every question has zero student exposures." : "At least one question has prior exposure.");
  push("section-match", allSectionMatched, allSectionMatched ? "Assignment sections match question sections." : "At least one assignment section does not match its question.");
  push("active-topics", allTopicsActive, allTopicsActive ? "Every question belongs to an active topic." : "At least one question belongs to an inactive topic.");
  push("quality-clean", allQualityClean, allQualityClean ? "All questions pass deterministic review with zero warnings." : "At least one question has a blocking flag or warning.");
  push("frozen-snapshots", allSnapshotsMatch, allSnapshotsMatch ? "Frozen answer/topic snapshots match the audited form." : "At least one frozen answer/topic snapshot does not match the audited question.");
  push("english-math-unset", englishMathSetFree, englishMathSetFree ? "English/Math questions are not stimulus-set backed." : "An English/Math question unexpectedly belongs to a question set.");
  push("reading-science-set-backed", readingScienceSetBacked, readingScienceSetBacked ? "Every Reading/Science question belongs to a complete set." : "A Reading/Science question is missing its shared set.");

  const sectionSummaries: MockFormAudit["sectionSummaries"] = [];
  let positionsValid = true;
  for (const sectionKey of SECTION_ORDER) {
    const sectionRows = questionAuditRows
      .filter((row) => row.sectionKey === sectionKey)
      .sort((a, b) => a.position - b.position);
    const expected = REQUIRED_COUNTS[sectionKey];
    const difficulty: Record<string, number> = {};
    const topics: Record<string, number> = {};
    for (const row of sectionRows) {
      difficulty[row.difficulty] = (difficulty[row.difficulty] ?? 0) + 1;
      topics[row.topicName] = (topics[row.topicName] ?? 0) + 1;
    }
    const expectedPositions = Array.from({ length: sectionRows.length }, (_, index) => index + 1);
    positionsValid &&= sectionRows.every((row, index) => row.position === expectedPositions[index]);
    const setCount = new Set(sectionRows.map((row) => row.questionSetId).filter(Boolean)).size;

    push(
      `section-count-${sectionKey}`,
      sectionRows.length === expected,
      `${sectionKey}: ${sectionRows.length}/${expected} questions.`
    );
    sectionSummaries.push({ sectionKey, count: sectionRows.length, expected, difficulty, topics, setCount });
  }
  push("positions-contiguous", positionsValid, positionsValid ? "All section positions are contiguous from 1." : "At least one section has a position gap or duplicate.");

  const setIds = Array.from(new Set(rows.map((row) => row.questionSetId).filter((id): id is string => Boolean(id))));
  let wholeSets = true;
  if (setIds.length > 0) {
    const siblingRows = await db
      .select({
        id: questions.id,
        questionSetId: questions.questionSetId,
        status: questions.status,
        usageScope: questions.usageScope,
      })
      .from(questions)
      .where(
        and(
          inArray(questions.questionSetId, setIds),
          eq(questions.usageScope, "mock_reserve"),
          ne(questions.status, "rejected")
        )
      );

    const assignedBySet = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.questionSetId) continue;
      const ids = assignedBySet.get(row.questionSetId) ?? new Set<string>();
      ids.add(row.id);
      assignedBySet.set(row.questionSetId, ids);
    }

    for (const sibling of siblingRows) {
      if (!sibling.questionSetId) continue;
      if (!assignedBySet.get(sibling.questionSetId)?.has(sibling.id)) {
        wholeSets = false;
        break;
      }
    }
  }
  push("whole-reading-science-sets", wholeSets, wholeSets ? "Every included Reading/Science set is complete." : "At least one Reading/Science set is only partially assigned.");

  return {
    form,
    pass: checks.every((check) => check.pass),
    totalQuestions: rows.length,
    checks,
    sectionSummaries,
    questions: questionAuditRows,
  };
}
