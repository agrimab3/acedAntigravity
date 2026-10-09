export type MockSectionKey = "english" | "math" | "reading" | "science";
export type OutboxAnswer = "A" | "B" | "C" | "D" | null;

export type MockAnswerOutboxEntry = {
  questionId: string;
  selectedAnswer: OutboxAnswer;
  flagged: boolean;
  clientSequence: number;
  pickedAtServer: string;
};

export type MockAnswerOutbox = {
  sessionId: string;
  sectionRunId: string;
  sectionKey: MockSectionKey;
  entries: MockAnswerOutboxEntry[];
};

const PREFIX = "aced-mock-answer-outbox:";
const SEQUENCE_PREFIX = "aced-mock-answer-sequence:";
const SESSION_CACHE_KEY = "aced-mock-session-cache";
let fallbackSequence = 0;

function key(registrationId: string, sectionKey: MockSectionKey) {
  return PREFIX + registrationId + ":" + sectionKey;
}

function safeParse(raw: string | null): MockAnswerOutbox | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MockAnswerOutbox;
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readOutbox(
  registrationId: string,
  sectionKey: MockSectionKey
): MockAnswerOutbox | null {
  try {
    return safeParse(window.localStorage.getItem(key(registrationId, sectionKey)));
  } catch {
    return null;
  }
}

export function writeOutbox(
  registrationId: string,
  outbox: MockAnswerOutbox
) {
  try {
    if (outbox.entries.length === 0) {
      window.localStorage.removeItem(key(registrationId, outbox.sectionKey));
    } else {
      window.localStorage.setItem(
        key(registrationId, outbox.sectionKey),
        JSON.stringify(outbox)
      );
    }
    return true;
  } catch {
    return false;
  }
}

export function enqueueOutboxEntry(
  registrationId: string,
  sessionId: string,
  sectionRunId: string,
  sectionKey: MockSectionKey,
  entry: MockAnswerOutboxEntry
) {
  const current =
    readOutbox(registrationId, sectionKey) ??
    ({
      sessionId,
      sectionRunId,
      sectionKey,
      entries: [],
    } satisfies MockAnswerOutbox);

  current.sessionId = sessionId;
  current.sectionRunId = sectionRunId;
  current.entries.push(entry);
  current.entries.sort((a, b) => a.clientSequence - b.clientSequence);
  return writeOutbox(registrationId, current);
}

export function readAllOutboxes(registrationId: string) {
  const sections: MockSectionKey[] = ["english", "math", "reading", "science"];
  return sections
    .map((sectionKey) => readOutbox(registrationId, sectionKey))
    .filter((value): value is MockAnswerOutbox => Boolean(value));
}

export function outboxCount(registrationId: string) {
  const questions = new Set<string>();
  for (const outbox of readAllOutboxes(registrationId)) {
    for (const entry of outbox.entries) {
      questions.add(entry.questionId);
    }
  }
  return questions.size;
}

export function nextClientSequence(registrationId: string) {
  const storageKey = SEQUENCE_PREFIX + registrationId;
  try {
    const previous = Number(window.localStorage.getItem(storageKey) ?? "0");
    const next = Math.max(Number.isFinite(previous) ? previous + 1 : 1, Date.now());
    window.localStorage.setItem(storageKey, String(next));
    return next;
  } catch {
    fallbackSequence = Math.max(fallbackSequence + 1, Date.now());
    return fallbackSequence;
  }
}

export function removeResolvedEntries(
  registrationId: string,
  resolvedSequences: Set<number>
) {
  for (const outbox of readAllOutboxes(registrationId)) {
    const next = {
      ...outbox,
      entries: outbox.entries.filter(
        (entry) => !resolvedSequences.has(entry.clientSequence)
      ),
    };
    writeOutbox(registrationId, next);
  }
}

export function overlayOutboxAnswers<T extends {
  id: string;
  selectedAnswer: OutboxAnswer;
  flagged: boolean;
}>(
  registrationId: string,
  sectionKey: MockSectionKey,
  questions: T[]
) {
  const outbox = readOutbox(registrationId, sectionKey);
  if (!outbox?.entries.length) return questions;

  const latest = new Map<string, MockAnswerOutboxEntry>();
  for (const entry of outbox.entries) {
    const previous = latest.get(entry.questionId);
    if (!previous || entry.clientSequence > previous.clientSequence) {
      latest.set(entry.questionId, entry);
    }
  }

  return questions.map((question) => {
    const pending = latest.get(question.id);
    return pending
      ? {
          ...question,
          selectedAnswer: pending.selectedAnswer,
          flagged: pending.flagged,
        }
      : question;
  });
}

export function writeSessionCache(value: unknown) {
  try {
    window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(value));
  } catch {
    // Offline durability still relies on the answer outbox if cache storage is unavailable.
  }
}

export function readSessionCache<T>() {
  try {
    const raw = window.localStorage.getItem(SESSION_CACHE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearSessionCache() {
  try {
    window.localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Ignore storage failures during reset.
  }
}

export function clearAllOutboxes(registrationId: string) {
  const sections: MockSectionKey[] = ["english", "math", "reading", "science"];
  try {
    for (const sectionKey of sections) {
      window.localStorage.removeItem(key(registrationId, sectionKey));
    }
  } catch {
    // Ignore storage cleanup failures in DEV reset.
  }
}
