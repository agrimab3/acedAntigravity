"use client";

import type { CSSProperties } from "react";
import { Fragment, useEffect, useEffectEvent, useMemo, useState } from "react";

type BacklogTopic = {
  sectionKey: string;
  topicSlug: string;
  topicName: string;
  draftCount: number;
  rawPublishedCount: number;
  rejectedCount: number;
  targetCount: number;
  targetPerDifficulty: number;
  serveablePublishedCount: number;
  serveableDraftCount: number;
  blockedPublishedCount: number;
  blockedDraftCount: number;
  warningPublishedCount: number;
  warningDraftCount: number;
  publishedGapCount: number;
  needsWork: boolean;
  reviewPriority: "critical" | "rebuild" | "watch" | "healthy";
  focusDifficulty: "easy" | "medium" | "hard" | "balanced";
  recommendedPerDifficulty: number;
  priorityScore: number;
  difficultyBreakdown: Array<{
    difficulty: "easy" | "medium" | "hard";
    publishedCount: number;
    serveablePublishedCount: number;
    blockedPublishedCount: number;
    warningPublishedCount: number;
    draftCount: number;
    serveableDraftCount: number;
    blockedDraftCount: number;
    warningDraftCount: number;
    publishedGapCount: number;
  }>;
};

type ReviewQuestion = {
  id: string;
  sectionKey: string;
  topicName: string;
  topicSlug: string;
  difficulty: string;
  prompt: string;
  passage: string | null;
  questionSetId: string | null;
  questionSetKind: "reading_passage" | "science_stimulus" | null;
  questionSetTitle: string | null;
  questionSetContent: string | null;
  choices: Record<"A" | "B" | "C" | "D", string>;
  correctAnswer: string;
  explanation: string;
  source: string;
  generationModel: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  qualityReview: {
    shouldServe: boolean;
    riskScore: number;
    autoPublishEligible: boolean;
    blockingFlags: Array<{
      severity: "reject" | "warn";
      code: string;
      message: string;
    }>;
    warningFlags: Array<{
      severity: "reject" | "warn";
      code: string;
      message: string;
    }>;
    findings: {
      uniqueCorrectAnswer: "pass" | "fail" | "unknown";
      answerKeyVerified: "pass" | "fail" | "unknown";
      explanationVerified: "pass" | "fail" | "unknown";
      choicesDistinct: "pass" | "fail" | "unknown";
      evidenceSupported: "pass" | "fail" | "unknown";
      sectionAppropriate: "pass" | "fail" | "unknown";
    };
  };
  shadowReview?: {
    autoPublishEligible?: boolean;
    disagreement?: boolean;
    verifierAgrees?: boolean;
  } | null;
};

type ReviewQuestionGroup = {
  id: string;
  sectionKey: string;
  topicName: string;
  topicSlug: string;
  questionSetId: string | null;
  questionSetKind: "reading_passage" | "science_stimulus" | null;
  questionSetTitle: string | null;
  sharedContent: string | null;
  children: ReviewQuestion[];
};

type GenerationSummary = {
  inserted?: number;
  setsInserted?: number;
  skipped?: number;
  reviewKept?: number;
  reviewRevised?: number;
  reviewRejected?: number;
  reviewErrors?: number;
  failures?: Array<{
    topic?: string;
    error?: string;
  }>;
};

type GenerationDebugEntry = {
  label: string;
  requestedChildCount?: number;
  plannedSetCount?: number;
  requestedDifficultyCounts?: Partial<Record<"easy" | "medium" | "hard", number>>;
  summary: GenerationSummary | null;
  stdout?: string | null;
  stderr?: string | null;
};

const sectionOptions = ["all", "english", "math", "reading", "science"] as const;
const statusOptions = ["draft", "published", "rejected"] as const;
const reviewQualityOptions = ["all", "blocked", "warning", "clean"] as const;
const reviewSortOptions = ["blocked-first", "highest-risk", "newest"] as const;
const bulkScopeOptions = ["math-reading", "current-filter", "all-sections"] as const;
const bulkCountOptions = [3, 6, 9] as const;
const topicBatchSizeOptions = [3, 6, 12, 18] as const;
const bulkChildCountOptions = [6, 12, 18] as const;

function getBacklogPriorityBadge(topic: BacklogTopic) {
  if (topic.reviewPriority === "critical") {
    return {
      label: "critical rebuild",
      tone: "danger" as const,
    };
  }

  if (topic.reviewPriority === "rebuild") {
    return {
      label: "rebuild next",
      tone: "warning" as const,
    };
  }

  if (topic.reviewPriority === "watch") {
    return {
      label: "watch warnings",
      tone: "warning" as const,
    };
  }

  return {
    label: "healthy live pool",
    tone: "success" as const,
  };
}

function formatFocusDifficulty(topic: BacklogTopic) {
  return topic.focusDifficulty === "balanced" ? "balanced mix" : `${topic.focusDifficulty} gap`;
}

function renderFormattedText(text: string) {
  const normalized = text
    .replace(/<u>(.*?)<\/u>/gi, "[underline]$1[/underline]")
    .replace(/__(.*?)__/g, "[underline]$1[/underline]");
  const lines = normalized.split("\n");

  return lines.map((line, lineIndex) => {
    const segments = line.split(/(\[underline\].*?\[\/underline\])/g);

    return (
      <Fragment key={`${line}-${lineIndex}`}>
        {segments.map((segment, segmentIndex) => {
          const match = segment.match(/^\[underline\](.*?)\[\/underline\]$/);
          if (match) {
            return <u key={`${segment}-${segmentIndex}`}>{match[1]}</u>;
          }

          return <Fragment key={`${segment}-${segmentIndex}`}>{segment}</Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}

function formatDifficultyMix(
  counts: Partial<Record<"easy" | "medium" | "hard", number>> | undefined
) {
  if (!counts) {
    return null;
  }

  return ["easy", "medium", "hard"]
    .map((difficulty) => `${difficulty} ${counts[difficulty as "easy" | "medium" | "hard"] ?? 0}`)
    .join(" · ");
}

function summarizeGenerationResults(
  results: Array<{
    summary?: GenerationSummary;
    requestedChildCount?: number;
    plannedSetCount?: number;
  }>
) {
  return results.reduce(
    (summary, result) => {
      summary.requested += Number(result.requestedChildCount ?? 0);
      summary.inserted += Number(result.summary?.inserted ?? 0);
      summary.plannedSets += Number(result.plannedSetCount ?? 0);
      summary.insertedSets += Number(result.summary?.setsInserted ?? 0);
      summary.kept += Number(result.summary?.reviewKept ?? 0);
      summary.revised += Number(result.summary?.reviewRevised ?? 0);
      summary.rejected += Number(result.summary?.reviewRejected ?? 0);
      summary.reviewErrors += Number(result.summary?.reviewErrors ?? 0);
      return summary;
    },
    {
      requested: 0,
      inserted: 0,
      plannedSets: 0,
      insertedSets: 0,
      kept: 0,
      revised: 0,
      rejected: 0,
      reviewErrors: 0,
    }
  );
}

export default function ReviewConsole() {
  const [backlog, setBacklog] = useState<BacklogTopic[]>([]);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [activeSection, setActiveSection] = useState<(typeof sectionOptions)[number]>("all");
  const [activeStatus, setActiveStatus] = useState<(typeof statusOptions)[number]>("draft");
  const [activeTopic, setActiveTopic] = useState("all");
  const [reviewQualityFilter, setReviewQualityFilter] = useState<(typeof reviewQualityOptions)[number]>("all");
  const [reviewSort, setReviewSort] = useState<(typeof reviewSortOptions)[number]>("blocked-first");
  const [bulkScope, setBulkScope] = useState<(typeof bulkScopeOptions)[number]>("math-reading");
  const [bulkTopicCount, setBulkTopicCount] = useState<(typeof bulkCountOptions)[number]>(6);
  const [bulkRequestedChildCount, setBulkRequestedChildCount] =
    useState<(typeof bulkChildCountOptions)[number]>(6);
  const [loadingBacklog, setLoadingBacklog] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [runningTopic, setRunningTopic] = useState<string | null>(null);
  const [runningBulkFill, setRunningBulkFill] = useState(false);
  const [runningLaunchSprint, setRunningLaunchSprint] = useState<"critical-gaps" | "launch-minimum" | null>(null);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [notesByQuestionId, setNotesByQuestionId] = useState<Record<string, string>>({});
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Record<string, boolean>>({});
  const [topicBatchSizes, setTopicBatchSizes] = useState<Record<string, (typeof topicBatchSizeOptions)[number]>>({});
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [generationDebug, setGenerationDebug] = useState<GenerationDebugEntry[] | null>(null);

  const availableTopics = useMemo(() => {
    return backlog.filter((topic) => activeSection === "all" || topic.sectionKey === activeSection);
  }, [activeSection, backlog]);

  const prioritizedBacklog = useMemo(() => {
    return [...availableTopics].sort((left, right) => {
      if (left.needsWork !== right.needsWork) {
        return left.needsWork ? -1 : 1;
      }

      if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return left.topicName.localeCompare(right.topicName);
    });
  }, [availableTopics]);

  const reviewQueueSummary = useMemo(() => {
    return questions.reduce(
      (summary, question) => {
        if (question.qualityReview.blockingFlags.length > 0) {
          summary.blocked += 1;
        } else if (question.qualityReview.warningFlags.length > 0) {
          summary.warning += 1;
        } else {
          summary.clean += 1;
        }

        return summary;
      },
      { blocked: 0, warning: 0, clean: 0 }
    );
  }, [questions]);

  const selectedQuestionCount = useMemo(
    () => questions.filter((question) => selectedQuestionIds[question.id]).length,
    [questions, selectedQuestionIds]
  );

  const questionGroups = useMemo<ReviewQuestionGroup[]>(() => {
    const groups = new Map<string, ReviewQuestionGroup>();

    questions.forEach((question) => {
      const isSetBacked = Boolean(question.questionSetId && question.questionSetContent);
      const groupId = isSetBacked ? `set:${question.questionSetId}` : `question:${question.id}`;
      const existing = groups.get(groupId);

      if (existing) {
        existing.children.push(question);
        return;
      }

      groups.set(groupId, {
        id: groupId,
        sectionKey: question.sectionKey,
        topicName: question.topicName,
        topicSlug: question.topicSlug,
        questionSetId: question.questionSetId,
        questionSetKind: question.questionSetKind,
        questionSetTitle: question.questionSetTitle,
        sharedContent: question.questionSetContent,
        children: [question],
      });
    });

    return Array.from(groups.values());
  }, [questions]);

  const allVisibleQuestionsSelected =
    questions.length > 0 && questions.every((question) => selectedQuestionIds[question.id]);

  function getTopicBatchKey(topic: BacklogTopic) {
    return `${topic.sectionKey}:${topic.topicSlug}`;
  }

  function getRequestedChildCount(topic: BacklogTopic) {
    return topicBatchSizes[getTopicBatchKey(topic)] ?? 3;
  }

  function setRequestedChildCount(
    topic: BacklogTopic,
    requestedChildCount: (typeof topicBatchSizeOptions)[number]
  ) {
    setTopicBatchSizes((current) => ({
      ...current,
      [getTopicBatchKey(topic)]: requestedChildCount,
    }));
  }

  function confirmGeneration(approxRequestedChildCount: number, label: string) {
    if (approxRequestedChildCount <= 18) {
      return true;
    }

    return window.confirm(
      `${label} may request about ${approxRequestedChildCount} draft child question${
        approxRequestedChildCount === 1 ? "" : "s"
      }. Continue?`
    );
  }

  async function loadBacklog() {
    setLoadingBacklog(true);
    try {
      const res = await fetch("/api/admin/backlog", { cache: "no-store" });
      const data = await res.json();
      setBacklog(data.topics ?? []);
    } finally {
      setLoadingBacklog(false);
    }
  }

  async function loadQuestions() {
    setLoadingQuestions(true);

    try {
      const params = new URLSearchParams({
        status: activeStatus,
        limit: "24",
        qualityFilter: reviewQualityFilter,
        sort: reviewSort,
      });

      if (activeSection !== "all") {
        params.set("section", activeSection);
      }

      if (activeTopic !== "all") {
        params.set("topic", activeTopic);
      }

      const res = await fetch(`/api/admin/questions?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      const nextQuestions = (data.questions ?? []) as ReviewQuestion[];
      setQuestions(nextQuestions);
      setNotesByQuestionId(
        Object.fromEntries(nextQuestions.map((question) => [question.id, question.reviewNotes ?? ""]))
      );
      setSelectedQuestionIds((current) =>
        Object.fromEntries(
          nextQuestions
            .filter((question) => current[question.id])
            .map((question) => [question.id, true])
        )
      );
    } finally {
      setLoadingQuestions(false);
    }
  }

  useEffect(() => {
    void loadBacklog();
  }, []);

  const handleLoadQuestions = useEffectEvent(() => {
    void loadQuestions();
  });

  useEffect(() => {
    handleLoadQuestions();
  }, [activeSection, activeStatus, activeTopic, reviewQualityFilter, reviewSort]);

  async function bulkFillCriticalTopics() {
    const approxRequestedChildCount = bulkRequestedChildCount * bulkTopicCount;

    if (!confirmGeneration(approxRequestedChildCount, "This bulk fill")) {
      return;
    }

    setRunningBulkFill(true);
    setFlashMessage(null);
    setGenerationDebug(null);

    const sectionKeys =
      bulkScope === "math-reading"
        ? ["math", "reading"]
        : bulkScope === "all-sections"
          ? ["english", "math", "reading", "science"]
          : activeSection === "all"
            ? ["english", "math", "reading", "science"]
            : [activeSection];

    try {
      const res = await fetch("/api/admin/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "bulk",
          sectionKeys,
          priorities: ["critical"],
          preferredDifficulties: ["hard", "medium"],
          maxTopics: bulkTopicCount,
          requestedChildCount: bulkRequestedChildCount,
          status: "draft",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Bulk generation failed.");
      }

      const totals = summarizeGenerationResults(data.results ?? []);

      setFlashMessage(
        `Filled ${data.selection?.selectedTopicCount ?? 0} critical topic batch${
          data.selection?.selectedTopicCount === 1 ? "" : "es"
        }: requested ${totals.requested}, inserted ${totals.inserted}${
          totals.insertedSets > 0 ? ` across ${totals.insertedSets} set${totals.insertedSets === 1 ? "" : "s"}` : ""
        }, reviewer kept ${totals.kept}, revised ${totals.revised}, rejected ${totals.rejected}, errors ${totals.reviewErrors}.`
      );
      setGenerationDebug(
        (data.results ?? []).map(
          (result: {
            sectionKey: string;
            topicName: string;
            topicSlug: string;
            requestedChildCount?: number;
            plannedSetCount?: number;
            requestedDifficultyCounts?: Partial<Record<"easy" | "medium" | "hard", number>>;
            summary?: GenerationSummary;
          }) => ({
            label: `${result.sectionKey}/${result.topicSlug} · ${result.topicName}`,
            requestedChildCount: result.requestedChildCount,
            plannedSetCount: result.plannedSetCount,
            requestedDifficultyCounts: result.requestedDifficultyCounts,
            summary: result.summary ?? null,
          })
        )
      );
      await Promise.all([loadBacklog(), loadQuestions()]);
    } catch (error) {
      setFlashMessage(error instanceof Error ? error.message : "Bulk generation failed.");
    } finally {
      setRunningBulkFill(false);
    }
  }

  async function generateDraftBatch(topic: BacklogTopic) {
    const requestedChildCount = getRequestedChildCount(topic);

    setRunningTopic(topic.topicSlug);
    setFlashMessage(null);
    setGenerationDebug(null);

    try {
      const res = await fetch("/api/admin/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionKey: topic.sectionKey,
          topicSlug: topic.topicSlug,
          requestedChildCount,
          status: "draft",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation failed.");
      }

      const summary = (data.summary ?? null) as GenerationSummary | null;
      const failureText =
        summary?.failures?.map((failure) => failure.error).filter(Boolean).join(" | ") ?? "";
      const setText =
        (summary?.setsInserted ?? 0) > 0
          ? ` across ${summary?.setsInserted ?? 0} set${summary?.setsInserted === 1 ? "" : "s"}`
          : "";

      setFlashMessage(
        `Requested ${requestedChildCount} draft child questions for ${topic.topicName}. Inserted ${
          summary?.inserted ?? 0
        }${setText}. Reviewer kept ${summary?.reviewKept ?? 0}, revised ${
          summary?.reviewRevised ?? 0
        }, rejected ${summary?.reviewRejected ?? 0}, errors ${summary?.reviewErrors ?? 0}${
          failureText ? ` · ${failureText}` : ""
        }.`
      );
      setGenerationDebug([
        {
          label: `${topic.sectionKey}/${topic.topicSlug} · ${topic.topicName}`,
          requestedChildCount,
          plannedSetCount: typeof data.plannedSetCount === "number" ? data.plannedSetCount : undefined,
          requestedDifficultyCounts:
            typeof data.requestedDifficultyCounts === "object" && data.requestedDifficultyCounts
              ? data.requestedDifficultyCounts
              : undefined,
          summary,
          stdout: typeof data.stdout === "string" ? data.stdout : null,
          stderr: typeof data.stderr === "string" ? data.stderr : null,
        },
      ]);
      await Promise.all([loadBacklog(), loadQuestions()]);
    } catch (error) {
      setFlashMessage(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setRunningTopic(null);
    }
  }

  async function runLaunchSprint(preset: "critical-gaps" | "launch-minimum") {
    if (!confirmGeneration(72, preset === "critical-gaps" ? "Critical gaps sprint" : "Launch minimum sprint")) {
      return;
    }

    setRunningLaunchSprint(preset);
    setFlashMessage(null);
    setGenerationDebug(null);

    try {
      const res = await fetch("/api/admin/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "launch-sprint",
          preset,
          status: "draft",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Launch sprint failed.");
      }

      const totals = summarizeGenerationResults(data.results ?? []);
      setFlashMessage(
        `${
          preset === "critical-gaps" ? "Critical gaps sprint" : "Toward launch minimum"
        }: requested ${totals.requested}, inserted ${totals.inserted}${
          totals.insertedSets > 0 ? ` across ${totals.insertedSets} set${totals.insertedSets === 1 ? "" : "s"}` : ""
        }, reviewer kept ${totals.kept}, revised ${totals.revised}, rejected ${totals.rejected}, errors ${totals.reviewErrors}.`
      );
      setGenerationDebug(
        (data.results ?? []).map(
          (result: {
            sectionKey: string;
            topicName: string;
            topicSlug: string;
            requestedChildCount?: number;
            plannedSetCount?: number;
            requestedDifficultyCounts?: Partial<Record<"easy" | "medium" | "hard", number>>;
            summary?: GenerationSummary;
          }) => ({
            label: `${result.sectionKey}/${result.topicSlug} · ${result.topicName}`,
            requestedChildCount: result.requestedChildCount,
            plannedSetCount: result.plannedSetCount,
            requestedDifficultyCounts: result.requestedDifficultyCounts,
            summary: result.summary ?? null,
          })
        )
      );
      await Promise.all([loadBacklog(), loadQuestions()]);
    } catch (error) {
      setFlashMessage(error instanceof Error ? error.message : "Launch sprint failed.");
    } finally {
      setRunningLaunchSprint(null);
    }
  }

  async function reviewQuestion(questionId: string, status: (typeof statusOptions)[number]) {
    setSavingQuestionId(questionId);
    setFlashMessage(null);

    try {
      const res = await fetch("/api/admin/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          status,
          reviewNotes: notesByQuestionId[questionId] ?? "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Review update failed.");
      }

      setFlashMessage(`Question moved to ${status}.`);
      await Promise.all([loadBacklog(), loadQuestions()]);
    } catch (error) {
      setFlashMessage(error instanceof Error ? error.message : "Review update failed.");
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function bulkReviewQuestions(status: (typeof statusOptions)[number]) {
    const questionIds = questions
      .filter((question) => selectedQuestionIds[question.id])
      .map((question) => question.id);

    if (questionIds.length === 0) {
      setFlashMessage("Select at least one question first.");
      return;
    }

    setBulkSaving(true);
    setFlashMessage(null);

    try {
      const notes = Array.from(
        new Set(
          questionIds
            .map((questionId) => notesByQuestionId[questionId]?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).join("\n\n");

      const res = await fetch("/api/admin/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "bulk",
          questionIds,
          status,
          reviewNotes: notes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Bulk review update failed.");
      }

      setFlashMessage(`Moved ${data.updatedCount ?? questionIds.length} question(s) to ${status}.`);
      setSelectedQuestionIds({});
      await Promise.all([loadBacklog(), loadQuestions()]);
    } catch (error) {
      setFlashMessage(error instanceof Error ? error.message : "Bulk review update failed.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px minmax(0,1fr)", gap: "18px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <section
          style={{
            borderRadius: "18px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            padding: "18px",
          }}
        >
          <div style={{ fontSize: "12px", letterSpacing: ".06em", color: "rgba(255,255,255,0.42)" }}>
            REVIEW FILTERS
          </div>
          <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
            <select
              value={activeSection}
              onChange={(event) => {
                setActiveSection(event.target.value as (typeof sectionOptions)[number]);
                setActiveTopic("all");
              }}
              style={selectStyle}
            >
              {sectionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={activeStatus}
              onChange={(event) => setActiveStatus(event.target.value as (typeof statusOptions)[number])}
              style={selectStyle}
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select value={activeTopic} onChange={(event) => setActiveTopic(event.target.value)} style={selectStyle}>
              <option value="all">all topics</option>
              {availableTopics.map((topic) => (
                <option key={`${topic.sectionKey}:${topic.topicSlug}`} value={topic.topicSlug}>
                  {topic.topicName}
                </option>
              ))}
            </select>

            <select
              value={reviewQualityFilter}
              onChange={(event) => setReviewQualityFilter(event.target.value as (typeof reviewQualityOptions)[number])}
              style={selectStyle}
            >
              {reviewQualityOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all"
                    ? "all quality reads"
                    : option === "blocked"
                      ? "serve blocked only"
                      : option === "warning"
                        ? "warnings only"
                        : "clean only"}
                </option>
              ))}
            </select>

            <select
              value={reviewSort}
              onChange={(event) => setReviewSort(event.target.value as (typeof reviewSortOptions)[number])}
              style={selectStyle}
            >
              {reviewSortOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "blocked-first"
                    ? "blocked first"
                    : option === "highest-risk"
                      ? "highest risk"
                      : "newest first"}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section
          style={{
            borderRadius: "18px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            padding: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", letterSpacing: ".06em", color: "rgba(255,255,255,0.42)" }}>
                BACKLOG
              </div>
              <div style={{ marginTop: "4px", color: "rgba(255,255,255,0.66)", fontSize: "13px" }}>
                prioritize true serveable inventory gaps by topic
              </div>
            </div>
            <button onClick={() => void loadBacklog()} style={ghostButtonStyle}>
              refresh
            </button>
          </div>

          <div
            style={{
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.035)",
              padding: "12px",
              marginBottom: "12px",
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: ".06em", color: "rgba(255,255,255,0.38)" }}>
              BULK FILL
            </div>
            <div style={{ marginTop: "6px", fontSize: "13px", color: "rgba(255,255,255,0.68)", lineHeight: 1.55 }}>
              queue critical draft batches without clicking topic by topic
            </div>
            <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
              <select
                value={bulkScope}
                onChange={(event) => setBulkScope(event.target.value as (typeof bulkScopeOptions)[number])}
                style={selectStyle}
              >
                {bulkScopeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "math-reading"
                      ? "math + reading critical gaps"
                      : option === "current-filter"
                        ? "current section filter"
                        : "all critical topics"}
                  </option>
                ))}
              </select>

              <select
                value={String(bulkTopicCount)}
                onChange={(event) => setBulkTopicCount(Number(event.target.value) as (typeof bulkCountOptions)[number])}
                style={selectStyle}
              >
                {bulkCountOptions.map((count) => (
                  <option key={count} value={count}>
                    top {count} topics
                  </option>
                ))}
              </select>

              <select
                value={String(bulkRequestedChildCount)}
                onChange={(event) =>
                  setBulkRequestedChildCount(Number(event.target.value) as (typeof bulkChildCountOptions)[number])
                }
                style={selectStyle}
              >
                {bulkChildCountOptions.map((count) => (
                  <option key={count} value={count}>
                    about {count} child questions per topic
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => void bulkFillCriticalTopics()}
              disabled={runningBulkFill}
              style={{
                marginTop: "12px",
                width: "100%",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #1D9E75 0%, #4a85c2 100%)",
                color: "#fff",
                cursor: runningBulkFill ? "progress" : "pointer",
                opacity: runningBulkFill ? 0.75 : 1,
                fontSize: "13px",
              }}
            >
              {runningBulkFill ? "filling critical topics…" : "fill critical draft batches"}
            </button>
          </div>

          <div
            style={{
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              padding: "12px",
              marginBottom: "12px",
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: ".06em", color: "rgba(255,255,255,0.38)" }}>
              LAUNCH SPRINT
            </div>
            <div style={{ marginTop: "6px", fontSize: "13px", color: "rgba(255,255,255,0.68)", lineHeight: 1.55 }}>
              one-click draft generation presets using live backlog counts with hard server-side caps
            </div>

            <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
              <button
                onClick={() => void runLaunchSprint("critical-gaps")}
                disabled={runningLaunchSprint !== null}
                style={secondaryButtonStyle}
              >
                {runningLaunchSprint === "critical-gaps" ? "filling critical gaps…" : "fill critical gaps"}
              </button>
              <button
                onClick={() => void runLaunchSprint("launch-minimum")}
                disabled={runningLaunchSprint !== null}
                style={primaryButtonStyle}
              >
                {runningLaunchSprint === "launch-minimum"
                  ? "moving toward launch minimum…"
                  : "move toward launch minimum"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "70vh", overflowY: "auto" }}>
            {loadingBacklog ? (
              <div style={mutedTextStyle}>loading backlog…</div>
            ) : (
              prioritizedBacklog.map((topic) => {
                  const priorityBadge = getBacklogPriorityBadge(topic);
                  const batchSize = getRequestedChildCount(topic);
                  return (
                    <div
                      key={`${topic.sectionKey}:${topic.topicSlug}`}
                      style={{
                        borderRadius: "14px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        padding: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
                            {topic.sectionKey}
                          </div>
                          <div style={{ marginTop: "4px", fontWeight: 600 }}>{topic.topicName}</div>
                          <div style={{ marginTop: "6px", fontSize: "12px", color: "rgba(255,255,255,0.54)", lineHeight: 1.5 }}>
                            live pool {topic.serveablePublishedCount}/{topic.targetCount}
                            {topic.publishedGapCount > 0 ? ` · gap ${topic.publishedGapCount}` : " · target met"}
                            {" · "}
                            focus {formatFocusDifficulty(topic)}
                          </div>
                        </div>
                        <Badge text={priorityBadge.label} tone={priorityBadge.tone} />
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                          gap: "8px",
                          marginTop: "10px",
                        }}
                      >
                        <Metric label="serveable live" value={topic.serveablePublishedCount} />
                        <Metric label="blocked live" value={topic.blockedPublishedCount} />
                        <Metric label="serveable drafts" value={topic.serveableDraftCount} />
                        <Metric label="rejected" value={topic.rejectedCount} />
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "12px" }}>
                        {topic.difficultyBreakdown.map((difficulty) => (
                          <Badge
                            key={`${topic.topicSlug}-${difficulty.difficulty}`}
                            text={`${difficulty.difficulty} ${difficulty.serveablePublishedCount}/${topic.targetPerDifficulty}`}
                            tone={difficulty.publishedGapCount > 0 ? "warning" : "success"}
                          />
                        ))}
                        {topic.warningPublishedCount > 0 ? (
                          <Badge text={`${topic.warningPublishedCount} live warning${topic.warningPublishedCount === 1 ? "" : "s"}`} tone="warning" />
                        ) : null}
                        {topic.blockedDraftCount > 0 ? (
                          <Badge text={`${topic.blockedDraftCount} blocked draft${topic.blockedDraftCount === 1 ? "" : "s"}`} tone="danger" />
                        ) : null}
                      </div>

                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>
                          batch size
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {topicBatchSizeOptions.map((count) => {
                            const selected = batchSize === count;
                            return (
                              <button
                                key={`${topic.sectionKey}:${topic.topicSlug}:${count}`}
                                type="button"
                                onClick={() => setRequestedChildCount(topic, count)}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: "999px",
                                  border: selected ? "1px solid rgba(29,158,117,0.8)" : "1px solid rgba(255,255,255,0.12)",
                                  background: selected ? "rgba(29,158,117,0.18)" : "rgba(255,255,255,0.03)",
                                  color: selected ? "#D8FFF1" : "rgba(255,255,255,0.72)",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                }}
                              >
                                {count}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        onClick={() => void generateDraftBatch(topic)}
                        disabled={runningTopic === topic.topicSlug}
                        style={{
                          marginTop: "12px",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "12px",
                          border: "none",
                          background: "#1D9E75",
                          color: "#fff",
                          cursor: runningTopic === topic.topicSlug ? "progress" : "pointer",
                          opacity: runningTopic === topic.topicSlug ? 0.7 : 1,
                          fontSize: "13px",
                        }}
                      >
                        {runningTopic === topic.topicSlug
                          ? "generating draft batch…"
                          : `generate ${batchSize} draft questions`}
                      </button>
                    </div>
                  );
                })
            )}
          </div>
        </section>
      </div>

      <section
        style={{
          borderRadius: "18px",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          padding: "18px",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "14px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", letterSpacing: ".06em", color: "rgba(255,255,255,0.42)" }}>
              REVIEW QUEUE
            </div>
            <div style={{ marginTop: "4px", color: "rgba(255,255,255,0.66)", fontSize: "13px" }}>
              inspect draft content before broad rollout
            </div>
          </div>
          <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
            <Badge text={`${reviewQueueSummary.blocked} blocked`} tone="danger" />
            <Badge text={`${reviewQueueSummary.warning} warning-heavy`} tone="warning" />
            <Badge text={`${reviewQueueSummary.clean} clean`} tone="success" />
          </div>
          <button onClick={() => void loadQuestions()} style={ghostButtonStyle}>
            refresh
          </button>
        </div>

        {flashMessage && (
          <div
            style={{
              marginBottom: "14px",
              padding: "11px 13px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.82)",
              fontSize: "13px",
            }}
          >
            {flashMessage}
          </div>
        )}

        {generationDebug && generationDebug.length > 0 && (
          <div
            style={{
              marginBottom: "14px",
              padding: "13px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: ".06em", color: "rgba(255,255,255,0.42)" }}>
              GENERATION DEBUG
            </div>

            {generationDebug.map((entry) => {
              const failures = entry.summary?.failures ?? [];

              return (
                <div
                  key={entry.label}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.86)", fontWeight: 600 }}>
                    {entry.label}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                    {typeof entry.requestedChildCount === "number" ? (
                      <Badge text={`requested ${entry.requestedChildCount}`} tone="success" subtle />
                    ) : null}
                    {typeof entry.plannedSetCount === "number" && entry.plannedSetCount > 0 ? (
                      <Badge text={`planned sets ${entry.plannedSetCount}`} tone="warning" subtle />
                    ) : null}
                    <Badge text={`inserted ${entry.summary?.inserted ?? 0}`} tone="success" />
                    <Badge text={`kept ${entry.summary?.reviewKept ?? 0}`} tone="success" subtle />
                    <Badge text={`revised ${entry.summary?.reviewRevised ?? 0}`} tone="warning" />
                    <Badge text={`rejected ${entry.summary?.reviewRejected ?? 0}`} tone="danger" />
                    <Badge text={`review errors ${entry.summary?.reviewErrors ?? 0}`} tone="danger" subtle />
                    <Badge text={`skipped ${entry.summary?.skipped ?? 0}`} subtle />
                  </div>

                  {formatDifficultyMix(entry.requestedDifficultyCounts) ? (
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.56)" }}>
                      difficulty mix · {formatDifficultyMix(entry.requestedDifficultyCounts)}
                    </div>
                  ) : null}

                  {failures.length > 0 && (
                    <div style={{ display: "grid", gap: "6px" }}>
                      {failures.map((failure, index) => (
                        <div
                          key={`${entry.label}-failure-${index}`}
                          style={{
                            fontSize: "12px",
                            lineHeight: 1.6,
                            color: "#FFD7CB",
                          }}
                        >
                          {failure.topic ? `${failure.topic}: ` : ""}
                          {failure.error || "unknown failure"}
                        </div>
                      ))}
                    </div>
                  )}

                  {entry.stderr?.trim() ? (
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: "11px",
                        lineHeight: 1.5,
                        color: "rgba(255,255,255,0.58)",
                        background: "rgba(0,0,0,0.18)",
                        borderRadius: "10px",
                        padding: "10px",
                      }}
                    >
                      {entry.stderr.trim()}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "14px",
            padding: "11px 12px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "rgba(255,255,255,0.82)" }}>
              <input
                type="checkbox"
                checked={allVisibleQuestionsSelected}
                onChange={(event) =>
                  setSelectedQuestionIds(
                    event.target.checked
                      ? Object.fromEntries(questions.map((question) => [question.id, true]))
                      : {}
                  )
                }
              />
              select visible
            </label>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              {selectedQuestionCount} selected
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => void bulkReviewQuestions("rejected")}
              disabled={bulkSaving}
              style={secondaryButtonStyle}
            >
              {bulkSaving ? "saving…" : "bulk reject"}
            </button>
            <button
              onClick={() => void bulkReviewQuestions("draft")}
              disabled={bulkSaving}
              style={ghostButtonStyle}
            >
              keep as draft
            </button>
            <button
              onClick={() => void bulkReviewQuestions("published")}
              disabled={bulkSaving}
              style={primaryButtonStyle}
            >
              bulk publish
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {loadingQuestions ? (
            <div style={mutedTextStyle}>loading questions…</div>
          ) : questions.length === 0 ? (
            <div style={mutedTextStyle}>no questions match the current filters.</div>
          ) : (
            questionGroups.map((group) => (
              <article
                key={group.id}
                style={{
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    marginBottom: "10px",
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <Badge text={`${group.sectionKey} · ${group.topicName}`} />
                    {group.questionSetKind ? (
                      <Badge
                        text={
                          group.questionSetKind === "reading_passage"
                            ? "shared passage set"
                            : "shared stimulus set"
                        }
                        tone="warning"
                      />
                    ) : null}
                    {group.questionSetTitle ? <Badge text={group.questionSetTitle} subtle /> : null}
                  </div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.34)" }}>
                    {group.children.length} question{group.children.length === 1 ? "" : "s"}
                  </div>
                </div>

                {group.sharedContent ? (
                  <div style={{ ...passageStyle, marginBottom: "14px" }}>
                    <div style={{ fontSize: "10px", letterSpacing: ".06em", color: "rgba(255,255,255,0.38)", marginBottom: "7px" }}>
                      {group.questionSetKind === "science_stimulus" ? "SHARED STIMULUS / SETUP" : "SHARED PASSAGE"}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "13px", color: "rgba(255,255,255,0.78)" }}>
                      {renderFormattedText(group.sharedContent)}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "grid", gap: "14px" }}>
                  {group.children.map((question) => (
                    <div
                      key={question.id}
                      style={{
                        borderRadius: "14px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        padding: "14px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                          marginBottom: "10px",
                        }}
                      >
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                          <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedQuestionIds[question.id])}
                              onChange={(event) =>
                                setSelectedQuestionIds((current) => ({
                                  ...current,
                                  [question.id]: event.target.checked,
                                }))
                              }
                            />
                          </label>
                          <Badge text={question.difficulty} />
                          <Badge text={question.status} subtle />
                          <Badge
                            text={
                              question.qualityReview.blockingFlags.length > 0
                                ? "serve blocked"
                                : question.qualityReview.warningFlags.length > 0
                                  ? `risk ${question.qualityReview.riskScore}`
                                  : "clean read"
                            }
                            tone={
                              question.qualityReview.blockingFlags.length > 0
                                ? "danger"
                                : question.qualityReview.warningFlags.length > 0
                                  ? "warning"
                                  : "success"
                            }
                          />
                          {question.shadowReview ? (
                            <Badge
                              text={
                                question.shadowReview.autoPublishEligible
                                  ? "shadow eligible"
                                  : question.shadowReview.disagreement
                                    ? "shadow hold"
                                    : "not auto-eligible"
                              }
                              tone={
                                question.shadowReview.autoPublishEligible
                                  ? "success"
                                  : question.shadowReview.disagreement
                                    ? "warning"
                                    : "warning"
                              }
                              subtle={!question.shadowReview.autoPublishEligible}
                            />
                          ) : null}
                          {question.generationModel ? <Badge text={question.generationModel} subtle /> : null}
                        </div>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.34)" }}>
                          {new Date(question.createdAt).toLocaleString()}
                        </div>
                      </div>

                      {(question.qualityReview.blockingFlags.length > 0 ||
                        question.qualityReview.warningFlags.length > 0) && (
                        <div
                          style={{
                            borderRadius: "12px",
                            padding: "12px 13px",
                            background:
                              question.qualityReview.blockingFlags.length > 0
                                ? "rgba(240,153,123,0.11)"
                                : "rgba(239,159,39,0.1)",
                            border:
                              question.qualityReview.blockingFlags.length > 0
                                ? "1px solid rgba(240,153,123,0.22)"
                                : "1px solid rgba(239,159,39,0.2)",
                            marginBottom: "12px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "11px",
                              letterSpacing: ".06em",
                              color:
                                question.qualityReview.blockingFlags.length > 0
                                  ? "#F0997B"
                                  : "#EF9F27",
                              marginBottom: "8px",
                            }}
                          >
                            QUALITY READ
                          </div>
                          <div style={{ display: "grid", gap: "8px" }}>
                            {question.qualityReview.blockingFlags.map((flag) => (
                              <div key={`${question.id}-${flag.code}`} style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }}>
                                <strong style={{ color: "#F0997B" }}>block:</strong> {flag.message}
                              </div>
                            ))}
                            {question.qualityReview.warningFlags.map((flag) => (
                              <div key={`${question.id}-${flag.code}`} style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.76)" }}>
                                <strong style={{ color: "#EF9F27" }}>watch:</strong> {flag.message}
                              </div>
                            ))}
                            {question.shadowReview && !question.shadowReview.autoPublishEligible ? (
                              <div style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.76)" }}>
                                <strong style={{ color: "#EF9F27" }}>shadow:</strong>{" "}
                                {question.shadowReview.disagreement
                                  ? "secondary correctness verification disagreed, so this stays draft-only."
                                  : "auto-publish shadow checks are not fully satisfied."}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {!group.sharedContent && question.passage ? (
                        <div style={passageStyle}>
                          <div style={{ fontSize: "10px", letterSpacing: ".06em", color: "rgba(255,255,255,0.38)", marginBottom: "7px" }}>
                            PASSAGE / SETUP
                          </div>
                          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "13px", color: "rgba(255,255,255,0.78)" }}>
                            {renderFormattedText(question.passage)}
                          </div>
                        </div>
                      ) : null}

                      <div
                        style={{
                          fontFamily: "DM Serif Display, serif",
                          fontSize: "20px",
                          lineHeight: 1.45,
                          marginBottom: "12px",
                        }}
                      >
                        {renderFormattedText(question.prompt)}
                      </div>

                      <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
                        {(["A", "B", "C", "D"] as const).map((choice) => (
                          <div
                            key={choice}
                            style={{
                              borderRadius: "12px",
                              padding: "10px 12px",
                              border: `1px solid ${question.correctAnswer === choice ? "rgba(93,202,165,0.4)" : "rgba(255,255,255,0.08)"}`,
                              background:
                                question.correctAnswer === choice
                                  ? "rgba(93,202,165,0.09)"
                                  : "rgba(255,255,255,0.02)",
                              fontSize: "13px",
                              color: "rgba(255,255,255,0.82)",
                            }}
                          >
                            <strong style={{ marginRight: "8px" }}>{choice}</strong>
                            {renderFormattedText(question.choices[choice])}
                          </div>
                        ))}
                      </div>

                      <div
                        style={{
                          borderRadius: "12px",
                          padding: "12px 13px",
                          background: "rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.72)",
                          fontSize: "13px",
                          lineHeight: 1.65,
                          marginBottom: "12px",
                        }}
                      >
                        <strong style={{ color: "#5DCAA5" }}>Explanation:</strong> {question.explanation}
                      </div>

                      <textarea
                        value={notesByQuestionId[question.id] ?? ""}
                        onChange={(event) =>
                          setNotesByQuestionId((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                        placeholder="review notes, accuracy concerns, or why this should be rejected…"
                        style={{
                          width: "100%",
                          minHeight: "92px",
                          borderRadius: "12px",
                          padding: "12px 13px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.09)",
                          color: "#fff",
                          resize: "vertical",
                          fontSize: "13px",
                          outline: "none",
                          marginBottom: "12px",
                          fontFamily: "DM Sans, sans-serif",
                        }}
                      />

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          onClick={() => void reviewQuestion(question.id, "published")}
                          disabled={savingQuestionId === question.id}
                          style={primaryButtonStyle}
                        >
                          publish
                        </button>
                        <button
                          onClick={() => void reviewQuestion(question.id, "rejected")}
                          disabled={savingQuestionId === question.id}
                          style={secondaryButtonStyle}
                        >
                          reject
                        </button>
                        <button
                          onClick={() => void reviewQuestion(question.id, "draft")}
                          disabled={savingQuestionId === question.id}
                          style={ghostButtonStyle}
                        >
                          keep as draft
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        borderRadius: "12px",
        background: "rgba(255,255,255,0.04)",
        padding: "10px",
      }}
    >
      <div style={{ fontSize: "20px", fontFamily: "DM Serif Display, serif" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.38)" }}>{label}</div>
    </div>
  );
}

function Badge({
  text,
  subtle = false,
  tone = "default",
}: {
  text: string;
  subtle?: boolean;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const palette = subtle
    ? {
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.62)",
      }
    : tone === "danger"
      ? {
          background: "rgba(240,153,123,0.14)",
          color: "#F0997B",
        }
      : tone === "warning"
        ? {
            background: "rgba(239,159,39,0.14)",
            color: "#EF9F27",
          }
        : tone === "success"
          ? {
              background: "rgba(93,202,165,0.14)",
              color: "#5DCAA5",
            }
          : {
              background: "rgba(93,202,165,0.14)",
              color: "#5DCAA5",
            };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "4px 9px",
        fontSize: "11px",
        background: palette.background,
        color: palette.color,
      }}
    >
      {text}
    </span>
  );
}

const selectStyle: CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  padding: "11px 12px",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.1)",
  fontSize: "13px",
};

const ghostButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.82)",
  fontSize: "13px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  padding: "10px 13px",
  borderRadius: "12px",
  background: "#1D9E75",
  border: "none",
  color: "#fff",
  fontSize: "13px",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "10px 13px",
  borderRadius: "12px",
  background: "rgba(240,153,123,0.14)",
  border: "1px solid rgba(240,153,123,0.24)",
  color: "#F0997B",
  fontSize: "13px",
  cursor: "pointer",
};

const mutedTextStyle: CSSProperties = {
  color: "rgba(255,255,255,0.48)",
  fontSize: "13px",
};

const passageStyle: CSSProperties = {
  borderRadius: "14px",
  padding: "13px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: "12px",
};
