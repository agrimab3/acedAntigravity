export type PracticeReviewRecord = {
  userId: string;
  sessionId: string;
  questionId: string;
  isCorrect: boolean;
  submittedAt: Date;
  usageScope: string;
  section: string;
};

export function selectMissedReviewRecords({
  records,
  userId,
  sessionId,
  section,
  since,
}: {
  records: PracticeReviewRecord[];
  userId: string;
  sessionId?: string | null;
  section?: string | null;
  since: Date;
}) {
  const eligible = records
    .filter(
      (record) =>
        record.userId === userId &&
        record.usageScope === "practice" &&
        (!section || record.section === section)
    )
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

  const latestByQuestion = new Map<string, PracticeReviewRecord>();
  for (const record of eligible) {
    if (!latestByQuestion.has(record.questionId)) {
      latestByQuestion.set(record.questionId, record);
    }
  }

  const source = sessionId
    ? eligible.filter((record) => record.sessionId === sessionId && !record.isCorrect)
    : eligible.filter(
        (record) =>
          record.submittedAt >= since &&
          latestByQuestion.get(record.questionId) === record &&
          !record.isCorrect
      );

  const seen = new Set<string>();
  return source.filter((record) => {
    if (seen.has(record.questionId)) return false;
    seen.add(record.questionId);

    const latest = latestByQuestion.get(record.questionId);
    return Boolean(latest && !latest.isCorrect);
  });
}
