import type { QuestionSetKind } from "@/db/schema";
import type { ChoiceMap } from "@/db/schema";

export type NormalizedQuestionRow = {
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
  correct_answer: keyof ChoiceMap;
  explanation: string;
};

export type QuestionQualityFlag = {
  severity: "reject" | "warn";
  code: string;
  message: string;
};

export type QuestionQualityReview = {
  shouldServe: boolean;
  riskScore: number;
  blockingFlags: QuestionQualityFlag[];
  warningFlags: QuestionQualityFlag[];
  findings: {
    uniqueCorrectAnswer: "pass" | "fail" | "unknown";
    answerKeyVerified: "pass" | "fail" | "unknown";
    explanationVerified: "pass" | "fail" | "unknown";
    choicesDistinct: "pass" | "fail" | "unknown";
    evidenceSupported: "pass" | "fail" | "unknown";
    sectionAppropriate: "pass" | "fail" | "unknown";
  };
  autoPublishEligible: boolean;
};

export function normalizeCorrectAnswer(answer: string): keyof ChoiceMap | null {
  const normalized = answer.trim().toUpperCase();
  return ["A", "B", "C", "D"].includes(normalized) ? (normalized as keyof ChoiceMap) : null;
}

function parseNumericEquivalent(value: string) {
  const normalized = value.replace(/,/g, "").replace(/\s+/g, "").trim();

  if (!normalized) {
    return null;
  }

  if (/^-?\d+\/-?\d+$/.test(normalized)) {
    const [numerator, denominator] = normalized.split("/").map(Number);

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }

    return numerator / denominator;
  }

  if (/^-?\d*\.?\d+%$/.test(normalized)) {
    const numeric = Number(normalized.slice(0, -1));
    return Number.isFinite(numeric) ? numeric / 100 : null;
  }

  if (/^-?\d*\.?\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

export function normalizeChoiceForComparison(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function areEquivalentChoices(left: string, right: string) {
  const normalizedLeft = normalizeChoiceForComparison(left);
  const normalizedRight = normalizeChoiceForComparison(right);

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const leftMethodSignature = extractMethodSignature(left);
  const rightMethodSignature = extractMethodSignature(right);

  if (leftMethodSignature && rightMethodSignature && leftMethodSignature === rightMethodSignature) {
    return true;
  }

  const numericLeft = parseNumericEquivalent(normalizedLeft);
  const numericRight = parseNumericEquivalent(normalizedRight);

  if (numericLeft === null || numericRight === null) {
    return false;
  }

  return Math.abs(numericLeft - numericRight) < 1e-9;
}

type EnglishAction = { kind: "leave" | "move"; targetAfterSentence: number };

function getUnderlinedSentencePosition(passage: string | null) {
  if (!passage) return null;
  const markerIndex = passage.search(/\[underline\]/i);
  if (markerIndex < 0) return null;
  const before = passage.slice(0, markerIndex);
  const completedSentences = (before.match(/[.!?](?:\s|$)/g) ?? []).length;
  return completedSentences + 1;
}

function parseEnglishRevisionAction(choice: string, currentPosition: number): EnglishAction | null {
  const normalized = normalizeChoiceForComparison(choice);
  if (/\b(?:leave|keep) (?:the )?(?:underlined )?sentence where it is\b/.test(normalized)) {
    return { kind: "leave", targetAfterSentence: currentPosition - 1 };
  }

  const moveMatch = normalized.match(
    /\b(?:move (?:the )?(?:underlined )?sentence to follow (?:the )?|after (?:the )?sentence )?(first|second|third|fourth|\d+)(?: sentence)?\b/
  );
  if (!moveMatch) return null;
  const ordinal = moveMatch[1];
  const targetAfterSentence =
    ordinal === "first" ? 1 : ordinal === "second" ? 2 : ordinal === "third" ? 3 : ordinal === "fourth" ? 4 : Number(ordinal);
  return Number.isInteger(targetAfterSentence) && targetAfterSentence > 0
    ? { kind: "move", targetAfterSentence }
    : null;
}

export function findEquivalentEnglishRevisionChoices(
  passage: string | null,
  choices: ChoiceMap | null
) {
  const currentPosition = getUnderlinedSentencePosition(passage);
  if (!choices || currentPosition === null) return [] as Array<[keyof ChoiceMap, keyof ChoiceMap]>;
  const actions = (Object.keys(choices) as Array<keyof ChoiceMap>)
    .map((key) => [key, parseEnglishRevisionAction(choices[key], currentPosition)] as const)
    .filter((entry): entry is readonly [keyof ChoiceMap, EnglishAction] => entry[1] !== null);
  const equivalent: Array<[keyof ChoiceMap, keyof ChoiceMap]> = [];

  for (let index = 0; index < actions.length; index += 1) {
    for (let innerIndex = index + 1; innerIndex < actions.length; innerIndex += 1) {
      if (actions[index][1].targetAfterSentence === actions[innerIndex][1].targetAfterSentence) {
        equivalent.push([actions[index][0], actions[innerIndex][0]]);
      }
    }
  }

  return equivalent;
}

const TRANSITION_ADVERBS = new Set([
  "accordingly",
  "also",
  "consequently",
  "furthermore",
  "however",
  "indeed",
  "instead",
  "meanwhile",
  "moreover",
  "nevertheless",
  "nonetheless",
  "otherwise",
  "similarly",
  "therefore",
  "thus",
]);

const TRANSITION_PHRASES = new Set(["as a result", "for example", "in addition", "on the other hand"]);

function isStandaloneTransition(choice: string) {
  const normalized = normalizeChoiceForComparison(choice).replace(/,$/, "");
  return TRANSITION_ADVERBS.has(normalized) || TRANSITION_PHRASES.has(normalized);
}

function findInvalidEnglishTransitionCompletion(
  passage: string | null,
  choices: ChoiceMap | null,
  correctAnswer: keyof ChoiceMap | null
) {
  if (!passage || !choices) return null;

  const blankMatch = passage.match(/\[underline\]\s*(?:_{2,}|…+|\.\.\.)\s*\[\/underline\]\s*([A-Za-z]+)\b/i);
  if (!blankMatch) return null;

  // This deliberately targets only an obvious subject gap such as
  // "Consequently leads to ...". It is not intended to parse English generally.
  const followingWord = blankMatch[1].toLowerCase();
  if (!/^(leads|causes|creates|results|suggests|shows|indicates|makes|provides)$/i.test(followingWord)) {
    return null;
  }

  const viableChoices = (Object.entries(choices) as Array<[keyof ChoiceMap, string]>).filter(
    ([, choice]) => !isStandaloneTransition(choice)
  );
  const keyedChoice = correctAnswer ? choices[correctAnswer] : null;
  const keyedIsStandaloneTransition = keyedChoice !== null && isStandaloneTransition(keyedChoice);

  return {
    noViableCompletion: viableChoices.length === 0,
    keyedCompletionInvalid: keyedIsStandaloneTransition,
  };
}

function findDiscountDistractorExplanationMismatch(
  questionText: string,
  choices: ChoiceMap | null,
  explanation: string
) {
  if (!choices) return null;
  const priceMatch = questionText.match(/pack(?:\s+of\s+\d+\s+\w+)?\s+costs?\s+\$\s*(\d+(?:\.\d+)?)/i);
  const purchaseMatch = questionText.match(/buys?\s+(\d+(?:\.\d+)?)\s+packs?[^.]*?(\d+(?:\.\d+)?)%\s+discount/i);
  if (!priceMatch || !purchaseMatch) return null;

  const packs = Number(purchaseMatch[1]);
  const price = Number(priceMatch[1]);
  if (!Number.isFinite(packs) || !Number.isFinite(price)) return null;
  const undiscountedTotal = packs * price;
  const mistakenChoiceMentions = Array.from(
    explanation.matchAll(/(?:choice\s*)?([A-D])\s+(?:forgets|ignores)\s+(?:to\s+apply|the)\s*(?:the\s+)?discount/gi)
  )
    .map((match) => match[1]?.toUpperCase())
    .filter((choice): choice is keyof ChoiceMap => Boolean(choice));

  const mismatches = mistakenChoiceMentions.filter((choice) => {
    const amount = Number(choices[choice].replace(/[^0-9.-]/g, ""));
    return Number.isFinite(amount) && Math.abs(amount - undiscountedTotal) > 0.01;
  });

  return mismatches.length > 0 ? mismatches : null;
}

function hasLayeredMathReasoning(questionText: string, explanation: string) {
  const combined = `${questionText} ${explanation}`.toLowerCase();
  const hasPiecewiseBranching = /piecewise|begin\{cases\}|\bcases\b/.test(combined) && /f\s*\(\s*f\s*\(/.test(combined);
  const hasStructuralCondition =
    /vertex/.test(combined) &&
    /intersect(?:s|ion)?|exactly one point|discriminant|tangen(?:t|cy)/.test(combined) &&
    /discriminant|exactly one point|only common point/.test(combined);
  const functionConditions = (combined.match(/\b[fgh]\s*\(\s*-?\d+(?:\.\d+)?\s*\)\s*=/g) ?? []).length;
  const hasParameterizedFunction = /\b[fgh]\s*\(\s*x\s*\)\s*=\s*[a-z]/.test(combined);
  const hasFunctionStructureConstraint =
    /\bvertex\b|opens? (?:upward|downward)|axis of symmetry|lies on (?:the )?line|intersect(?:s|ion)?|tangen(?:t|cy)|discriminant/.test(
      combined
    );
  const hasDerivedParameterSystem =
    hasParameterizedFunction && functionConditions >= 2 && hasFunctionStructureConstraint;

  return hasPiecewiseBranching || hasStructuralCondition || hasDerivedParameterSystem;
}

function findMathPackDistractorWarning(questionText: string, choices: ChoiceMap | null) {
  if (!choices) return null;
  const packMatch = questionText.match(/pack of\s+(\d+)\s+premium\s+(?:pens|items|tickets|units)/i);
  const asksForItems = /how many premium (?:pens|items|tickets|units)/i.test(questionText);
  if (!packMatch || !asksForItems) return null;
  const packSize = Number(packMatch[1]);
  if (!Number.isInteger(packSize) || packSize < 2) return null;
  const invalidChoices = (Object.entries(choices) as Array<[keyof ChoiceMap, string]>).filter(
    ([, choice]) => /^\d+$/.test(choice.trim()) && Number(choice) !== 0 && Number(choice) % packSize !== 0
  );
  return invalidChoices.length >= 2
    ? `Multiple distractors (${invalidChoices.map(([key]) => key).join(", ")}) violate the explicit premium-pack size of ${packSize}.`
    : null;
}

function findGeometryLiteralObjectConflict(
  questionText: string,
  passage: string | null,
  explanation: string
) {
  const stated = `${questionText} ${passage ?? ""}`;
  const segmentIntersection = stated.match(
    /\bsegments?\s+([A-Z]{2})\s+(?:and|with)\s+([A-Z]{2})\s+intersect(?:\s+at\s+(?:point\s+)?([A-Z]))?/i
  );
  if (!segmentIntersection) return null;

  const firstSegment = segmentIntersection[1].toUpperCase();
  const secondSegment = segmentIntersection[2].toUpperCase();
  const intersectionPoint = segmentIntersection[3]?.toUpperCase() ?? null;
  if (!intersectionPoint) return null;

  // This is intentionally narrow: an explanation that places the named
  // intersection beyond an endpoint contradicts a stem that calls the finite
  // objects segments. It does not attempt to prove arbitrary geometry claims.
  const beyondMatch = explanation.match(
    new RegExp(`\\b${intersectionPoint}(?:,\\s*which)?\\s+(?:lies|is)\\s+(?:beyond|outside)\\s+(?:point\\s+)?([A-Z])\\b`, "i")
  );
  const extensionMatch = explanation.match(
    new RegExp(`\\b${intersectionPoint}\\s+(?:lies|is)\\s+on\\s+the\\s+extension\\s+of\\s+(?:segment\\s+)?([A-Z]{2})\\b`, "i")
  );
  const endpoint = beyondMatch?.[1]?.toUpperCase() ?? null;
  const extendedObject = extensionMatch?.[1]?.toUpperCase() ?? null;

  if (
    (endpoint && (firstSegment.includes(endpoint) || secondSegment.includes(endpoint))) ||
    (extendedObject && (extendedObject === firstSegment || extendedObject === secondSegment))
  ) {
    return { firstSegment, secondSegment, intersectionPoint };
  }

  return null;
}

export function normalizeChoices(choices: unknown): ChoiceMap | null {
  if (!choices || typeof choices !== "object") {
    return null;
  }

  const normalized = {} as ChoiceMap;

  for (const choice of ["A", "B", "C", "D"] as const) {
    const value = (choices as Record<string, unknown>)[choice];

    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }

    normalized[choice] = value.trim();
  }

  return normalized;
}

export function hasUnderlineMarkup(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /\[underline\].*?\[\/underline\]|__(.*?)__|<u>.*?<\/u>/i.test(value);
}

function normalizeTopicLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findExplanationChoiceMentions(explanation: string) {
  return Array.from(explanation.matchAll(/\b(?:choice|answer)\s*([A-D])\b/gi))
    .map((match) => match[1]?.toUpperCase())
    .filter((value): value is keyof ChoiceMap => Boolean(value));
}

function countWords(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function pushFlag(
  flags: QuestionQualityFlag[],
  severity: "reject" | "warn",
  code: string,
  message: string
) {
  flags.push({ severity, code, message });
}

function sanitizeSeriesKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b(the|group|values?|value|mean|average)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTimeLabel(unit: string, count: number) {
  return `${unit.toLowerCase()} ${count}`;
}

function parseTimeLabel(value: string) {
  const match = value.match(/\b(week|day|trial|month|year|hour)\s*(\d+)\b/i);

  if (!match) {
    return null;
  }

  return {
    unit: match[1].toLowerCase(),
    count: Number(match[2]),
    label: normalizeTimeLabel(match[1], Number(match[2])),
  };
}

function extractScienceMeasurements(passage: string | null) {
  if (!passage) {
    return null;
  }

  const measurements = new Map<string, Map<string, number>>();
  const timeOrder = new Map<string, number>();
  const chunks = passage
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.])\s+|;/))
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const time = parseTimeLabel(chunk);

    if (!time) {
      continue;
    }

    timeOrder.set(time.label, time.count);
    const chunkAfterTime = chunk
      .slice(chunk.toLowerCase().indexOf(time.label) + time.label.length)
      .replace(/^[:\-\s]+/, "");
    const pairRegex = /(?:^|,|\band\b)\s*([A-Za-z][A-Za-z0-9()\- ]{0,40}?)\s*(?:=|:)\s*(-?\d+(?:\.\d+)?)/g;
    let match;

    while ((match = pairRegex.exec(chunkAfterTime)) !== null) {
      const seriesName = match[1]?.trim().replace(/\s+/g, " ");
      const value = Number(match[2]);

      if (!seriesName || !Number.isFinite(value)) {
        continue;
      }

      const key = sanitizeSeriesKey(seriesName);

      if (!key) {
        continue;
      }

      const seriesMeasurements = measurements.get(key) ?? new Map<string, number>();
      seriesMeasurements.set(time.label, value);
      measurements.set(key, seriesMeasurements);
    }
  }

  if (measurements.size < 2 || timeOrder.size < 2) {
    return null;
  }

  return {
    measurements,
    orderedTimes: Array.from(timeOrder.entries())
      .sort((left, right) => left[1] - right[1])
      .map(([label]) => label),
  };
}

type ParsedScienceMeasurements = NonNullable<ReturnType<typeof extractScienceMeasurements>>;

function getCommonScienceTimes(
  parsedMeasurements: ParsedScienceMeasurements,
  leftValues: Map<string, number>,
  rightValues: Map<string, number>
) {
  return parsedMeasurements.orderedTimes.filter((time) => leftValues.has(time) && rightValues.has(time));
}

function getThresholdScienceTimes(
  commonTimes: string[],
  thresholdLabel: string,
  mode: "after" | "by"
) {
  const thresholdMeta = parseTimeLabel(thresholdLabel);

  if (!thresholdMeta) {
    return [];
  }

  return commonTimes.filter((time) => {
    const timeMeta = parseTimeLabel(time);

    if (!timeMeta || timeMeta.unit !== thresholdMeta.unit) {
      return false;
    }

    return mode === "after" ? timeMeta.count > thresholdMeta.count : timeMeta.count >= thresholdMeta.count;
  });
}

function resolveScienceSeriesValues(
  label: string,
  parsedMeasurements: ParsedScienceMeasurements
) {
  const seriesKey = matchSeriesName(label, Array.from(parsedMeasurements.measurements.keys()));

  if (!seriesKey) {
    return null;
  }

  const values = parsedMeasurements.measurements.get(seriesKey);

  if (!values) {
    return null;
  }

  return { seriesKey, values };
}

function nearlyEqual(left: number, right: number, tolerance = 1e-9) {
  return Math.abs(left - right) <= tolerance;
}

function evaluateScienceComparativeClaim(
  text: string,
  parsedMeasurements: ParsedScienceMeasurements
): boolean | null {
  const methodSignature = extractMethodSignature(text);

  if (methodSignature) {
    return true;
  }

  const normalizedText = normalizeChoiceForComparison(text);

  const surpassMatch = normalizedText.match(
    /([a-z][a-z0-9()\- ]+?)\s+(?:started|began)\s+(?:slightly\s+|somewhat\s+)?(lower|below|higher|above)\s+(?:than\s+)?(?:the\s+)?([a-z][a-z0-9()\- ]+?)\s+but\s+(surpassed|overtook|rose above|moved above|fell below|dropped below)\s+(?:the\s+)?([a-z][a-z0-9()\- ]+?)?\s*(?:after|by)\s+(week|day|trial|month|year|hour)\s*(\d+)/i
  );

  if (surpassMatch) {
    const leftSeries = resolveScienceSeriesValues(surpassMatch[1], parsedMeasurements);
    const rightSeries = resolveScienceSeriesValues(surpassMatch[3], parsedMeasurements);
    const repeatedRightSeries = surpassMatch[5]
      ? resolveScienceSeriesValues(surpassMatch[5], parsedMeasurements)
      : rightSeries;
    const thresholdLabel = normalizeTimeLabel(surpassMatch[6], Number(surpassMatch[7]));

    if (!leftSeries || !rightSeries || !repeatedRightSeries) {
      return null;
    }

    if (rightSeries.seriesKey !== repeatedRightSeries.seriesKey) {
      return null;
    }

    const commonTimes = getCommonScienceTimes(parsedMeasurements, leftSeries.values, rightSeries.values);
    const earliestTime = commonTimes[0];

    if (!earliestTime) {
      return null;
    }

    const earliestLeft = leftSeries.values.get(earliestTime);
    const earliestRight = rightSeries.values.get(earliestTime);

    if (earliestLeft === undefined || earliestRight === undefined) {
      return null;
    }

    const startedComparison =
      (surpassMatch[2] === "lower" || surpassMatch[2] === "below")
        ? earliestLeft < earliestRight
        : earliestLeft > earliestRight;
    const thresholdTimes = getThresholdScienceTimes(
      commonTimes,
      thresholdLabel,
      normalizedText.includes(" by ") ? "by" : "after"
    );

    if (thresholdTimes.length === 0) {
      return false;
    }

    const surpassedAfterThreshold = thresholdTimes.some((time) => {
      const leftValue = leftSeries.values.get(time);
      const rightValue = rightSeries.values.get(time);

      if (leftValue === undefined || rightValue === undefined) {
        return false;
      }

      return /(fell below|dropped below)/.test(surpassMatch[4])
        ? leftValue < rightValue
        : leftValue > rightValue;
    });

    return startedComparison && surpassedAfterThreshold;
  }

  const thresholdMatch = normalizedText.match(
    /([a-z][a-z0-9()\- ]+?)\s+(?:consistently\s+)?(?:outperformed|exceeded|was at least|was more than)\s+(?:the\s+)?([a-z][a-z0-9()\- ]+?)\s+by\s+at\s+least\s+(-?\d+(?:\.\d+)?)\s*(?:cm|mm|m|%|percent)?\s+at\s+(?:every|each)\s+(?:measurement|time point|interval)/i
  );

  if (thresholdMatch) {
    const leftSeries = resolveScienceSeriesValues(thresholdMatch[1], parsedMeasurements);
    const rightSeries = resolveScienceSeriesValues(thresholdMatch[2], parsedMeasurements);
    const threshold = Number(thresholdMatch[3]);

    if (!leftSeries || !rightSeries || !Number.isFinite(threshold)) {
      return null;
    }

    const commonTimes = getCommonScienceTimes(parsedMeasurements, leftSeries.values, rightSeries.values);

    if (commonTimes.length === 0) {
      return null;
    }

    return commonTimes.every((time) => {
      const leftValue = leftSeries.values.get(time);
      const rightValue = rightSeries.values.get(time);

      if (leftValue === undefined || rightValue === undefined) {
        return false;
      }

      return leftValue - rightValue >= threshold;
    });
  }

  const remainedMatch = normalizedText.match(
    /([a-z][a-z0-9()\- ]+?)\s+(?:remained|stayed|was)\s+(above|below|higher than|lower than|greater than|less than)\s+(?:the\s+)?([a-z][a-z0-9()\- ]+?)\s+(?:throughout|at\s+(?:every|each)\s+(?:measurement|time point|interval))/i
  );

  if (remainedMatch) {
    const leftSeries = resolveScienceSeriesValues(remainedMatch[1], parsedMeasurements);
    const rightSeries = resolveScienceSeriesValues(remainedMatch[3], parsedMeasurements);

    if (!leftSeries || !rightSeries) {
      return null;
    }

    const commonTimes = getCommonScienceTimes(parsedMeasurements, leftSeries.values, rightSeries.values);

    if (commonTimes.length === 0) {
      return null;
    }

    const relation = remainedMatch[2];

    return commonTimes.every((time) => {
      const leftValue = leftSeries.values.get(time);
      const rightValue = rightSeries.values.get(time);

      if (leftValue === undefined || rightValue === undefined) {
        return false;
      }

      return /(below|lower than|less than)/.test(relation)
        ? leftValue < rightValue
        : leftValue > rightValue;
    });
  }

  const identicalMatch = normalizedText.match(
    /([a-z][a-z0-9()\- ]+?)\s+and\s+(?:the\s+)?([a-z][a-z0-9()\- ]+?)\s+had\s+identical\s+(?:growth\s+)?patterns?/i
  );

  if (identicalMatch) {
    const leftSeries = resolveScienceSeriesValues(identicalMatch[1], parsedMeasurements);
    const rightSeries = resolveScienceSeriesValues(identicalMatch[2], parsedMeasurements);

    if (!leftSeries || !rightSeries) {
      return null;
    }

    const commonTimes = getCommonScienceTimes(parsedMeasurements, leftSeries.values, rightSeries.values);

    if (commonTimes.length < 2) {
      return null;
    }

    const leftDeltas = commonTimes.slice(1).map((time, index) => {
      const previousTime = commonTimes[index];
      return (leftSeries.values.get(time) ?? Number.NaN) - (leftSeries.values.get(previousTime) ?? Number.NaN);
    });
    const rightDeltas = commonTimes.slice(1).map((time, index) => {
      const previousTime = commonTimes[index];
      return (rightSeries.values.get(time) ?? Number.NaN) - (rightSeries.values.get(previousTime) ?? Number.NaN);
    });

    return leftDeltas.every(
      (leftDelta, index) => Number.isFinite(leftDelta) && nearlyEqual(leftDelta, rightDeltas[index] ?? Number.NaN)
    );
  }

  const noGrowthMatch = normalizedText.match(
    /([a-z][a-z0-9()\- ]+?)\s+(?:showed|had)\s+no\s+growth\s+after\s+(week|day|trial|month|year|hour)\s*(\d+)/i
  );

  if (noGrowthMatch) {
    const series = resolveScienceSeriesValues(noGrowthMatch[1], parsedMeasurements);
    const thresholdLabel = normalizeTimeLabel(noGrowthMatch[2], Number(noGrowthMatch[3]));

    if (!series) {
      return null;
    }

    const orderedTimes = parsedMeasurements.orderedTimes.filter((time) => series.values.has(time));
    const thresholdTimes = getThresholdScienceTimes(orderedTimes, thresholdLabel, "after");

    if (thresholdTimes.length === 0) {
      return false;
    }

    const thresholdIndex = orderedTimes.findIndex((time) => time === thresholdTimes[0]);

    if (thresholdIndex <= 0) {
      return false;
    }

    return thresholdTimes.every((time) => {
      const previousTime = orderedTimes[orderedTimes.indexOf(time) - 1];
      const currentValue = series.values.get(time);
      const previousValue = previousTime ? series.values.get(previousTime) : undefined;

      return currentValue !== undefined && previousValue !== undefined && nearlyEqual(currentValue, previousValue);
    });
  }

  const monotonicMatch = normalizedText.match(
    /([a-z][a-z0-9()\- ]+?)\s+(increased|decreased|declined|grew)\s+(?:steadily\s+)?throughout/i
  );

  if (monotonicMatch) {
    const series = resolveScienceSeriesValues(monotonicMatch[1], parsedMeasurements);

    if (!series) {
      return null;
    }

    const orderedValues = parsedMeasurements.orderedTimes
      .filter((time) => series.values.has(time))
      .map((time) => series.values.get(time))
      .filter((value): value is number => value !== undefined);

    if (orderedValues.length < 2) {
      return null;
    }

    if (monotonicMatch[2] === "grew" || monotonicMatch[2] === "increased") {
      return orderedValues.every((value, index) => index === 0 || value > orderedValues[index - 1]);
    }

    return orderedValues.every((value, index) => index === 0 || value < orderedValues[index - 1]);
  }

  const simpleStartMatch = normalizedText.match(
    /([a-z][a-z0-9()\- ]+?)\s+(?:started|began)\s+(?:slightly\s+|somewhat\s+)?(lower|below|higher|above)\s+(?:than\s+)?(?:the\s+)?([a-z][a-z0-9()\- ]+?)\b/i
  );

  if (simpleStartMatch) {
    const leftSeries = resolveScienceSeriesValues(simpleStartMatch[1], parsedMeasurements);
    const rightSeries = resolveScienceSeriesValues(simpleStartMatch[3], parsedMeasurements);

    if (!leftSeries || !rightSeries) {
      return null;
    }

    const commonTimes = getCommonScienceTimes(parsedMeasurements, leftSeries.values, rightSeries.values);
    const earliestTime = commonTimes[0];

    if (!earliestTime) {
      return null;
    }

    const leftValue = leftSeries.values.get(earliestTime);
    const rightValue = rightSeries.values.get(earliestTime);

    if (leftValue === undefined || rightValue === undefined) {
      return null;
    }

    return /(lower|below)/.test(simpleStartMatch[2]) ? leftValue < rightValue : leftValue > rightValue;
  }

  return null;
}

function explanationContradictsScienceStimulus(
  explanation: string,
  parsedMeasurements: ParsedScienceMeasurements
) {
  const clauses = explanation
    .split(/(?<=[.?!])\s+|;|\bbut\b|\bbecause\b|\bhowever\b/gi)
    .map((clause) =>
      clause
        .replace(/^\s*(choice|answer)\s+[a-d]\s+is\s+correct\s+(?:because\s+)?/i, "")
        .trim()
    )
    .filter(Boolean);

  let recognizedClauseCount = 0;

  for (const clause of clauses) {
    const result = evaluateScienceComparativeClaim(clause, parsedMeasurements);

    if (result === null) {
      continue;
    }

    recognizedClauseCount += 1;

    if (result === false) {
      return true;
    }
  }

  return recognizedClauseCount > 0 ? false : null;
}

function matchSeriesName(text: string, availableSeriesKeys: string[]) {
  const normalizedText = sanitizeSeriesKey(text);
  const matchingKeys = availableSeriesKeys.filter(
    (seriesKey) => normalizedText.includes(seriesKey) || seriesKey.includes(normalizedText)
  );

  if (matchingKeys.length === 0) {
    return null;
  }

  return matchingKeys.sort((left, right) => right.length - left.length)[0];
}

function extractMethodSignature(value: string) {
  const normalized = normalizeChoiceForComparison(value);
  const weekReferences = Array.from(normalized.matchAll(/\bweek\s*(\d+)\b/g))
    .map((match) => Number(match[1]))
    .filter((count) => Number.isFinite(count))
    .sort((left, right) => left - right);
  const pairKey = weekReferences.length >= 2 ? `${weekReferences[0]}:${weekReferences[1]}` : null;

  if (
    pairKey &&
    /\b(average|mean)\b/.test(normalized) &&
    /\bbetween\b|\band\b/.test(normalized)
  ) {
    return `midpoint:${pairKey}`;
  }

  if (pairKey && /\blinear interpolation\b/.test(normalized)) {
    return `midpoint:${pairKey}`;
  }

  return null;
}

function extractSupportedScienceChoiceStatuses(
  row: Pick<
    Parameters<typeof reviewQuestionQuality>[0],
    "passage" | "topic" | "section" | "question_text" | "choices" | "correct_answer" | "explanation"
  >,
  choices: ChoiceMap | null
) {
  if (!choices || row.section !== "science") {
    return null;
  }

  const normalizedTopic = normalizeTopicLabel(row.topic);

  if (
    !normalizedTopic.includes("data representation") &&
    !normalizedTopic.includes("research summaries")
  ) {
    return null;
  }

  const parsedMeasurements = extractScienceMeasurements(row.passage);

  if (!parsedMeasurements) {
    return null;
  }

  const availableSeriesKeys = Array.from(parsedMeasurements.measurements.keys());
  const statuses = {} as Record<keyof ChoiceMap, boolean | null>;
  let recognizedChoiceCount = 0;

  for (const choice of ["A", "B", "C", "D"] as const) {
    const text = choices[choice];
    const evaluated = evaluateScienceComparativeClaim(text, parsedMeasurements);
    statuses[choice] = evaluated;

    if (evaluated !== null) {
      recognizedChoiceCount += 1;
    }
  }

  if (recognizedChoiceCount === 0) {
    return null;
  }

  return statuses;
}

export function reviewQuestionQuality(row: {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage: string | null;
  question_text: string;
  choices: unknown;
  correct_answer: string;
  explanation: string;
}): QuestionQualityReview {
  const flags: QuestionQualityFlag[] = [];
  const correctAnswer = normalizeCorrectAnswer(row.correct_answer);
  const choices = normalizeChoices(row.choices);
  const findings: QuestionQualityReview["findings"] = {
    uniqueCorrectAnswer: "unknown",
    answerKeyVerified: "unknown",
    explanationVerified: "unknown",
    choicesDistinct: "unknown",
    evidenceSupported: "unknown",
    sectionAppropriate: "unknown",
  };

  if (!correctAnswer || !choices || !choices[correctAnswer]) {
    pushFlag(flags, "reject", "invalid-answer-map", "Correct answer mapping is invalid or incomplete.");
  }

  if (choices) {
    const choiceValues = (["A", "B", "C", "D"] as const).map((choice) => choices[choice]);
    findings.choicesDistinct = "pass";

    for (let index = 0; index < choiceValues.length; index += 1) {
      for (let innerIndex = index + 1; innerIndex < choiceValues.length; innerIndex += 1) {
        if (areEquivalentChoices(choiceValues[index], choiceValues[innerIndex])) {
          findings.choicesDistinct = "fail";
          pushFlag(
            flags,
            "reject",
            "equivalent-choices",
            "Two answer choices collapse to the same value or meaning."
          );
        }
      }
    }
  }

  if (row.section === "english") {
    const equivalentActions = findEquivalentEnglishRevisionChoices(row.passage, choices);
    if (equivalentActions.length > 0) {
      findings.choicesDistinct = "fail";
      pushFlag(
        flags,
        "reject",
        "equivalent-english-revision-actions",
        "Two English revision choices resolve to the same passage position."
      );
    }

    const transitionCompletion = findInvalidEnglishTransitionCompletion(
      row.passage,
      choices,
      correctAnswer
    );
    if (transitionCompletion?.noViableCompletion) {
      findings.evidenceSupported = "fail";
      pushFlag(
        flags,
        "reject",
        "no-grammatical-transition-completion",
        "No supplied transition choice can grammatically fill the marked subject position."
      );
    } else if (transitionCompletion?.keyedCompletionInvalid) {
      findings.answerKeyVerified = "fail";
      pushFlag(
        flags,
        "reject",
        "invalid-keyed-transition-completion",
        "The keyed transition cannot grammatically complete the marked sentence."
      );
    }
  }

  const combinedText = `${row.question_text} ${row.passage ?? ""}`.toLowerCase();
  const normalizedTopic = normalizeTopicLabel(row.topic);
  const normalizedDifficulty = row.difficulty.trim().toLowerCase();
  const promptWordCount = countWords(row.question_text);
  const passageWordCount = countWords(row.passage);
  const explanationWordCount = countWords(row.explanation);
  const explanationChoiceMentions = findExplanationChoiceMentions(row.explanation);
  const allNumericChoices =
    choices !== null &&
    Object.values(choices).every((choice) => /^-?\d+(\.\d+)?$/.test(choice.trim()));
  const isMediumHard = normalizedDifficulty === "medium" || normalizedDifficulty === "hard";

  const packDistractorWarning = row.section === "math" ? findMathPackDistractorWarning(row.question_text, choices) : null;
  if (packDistractorWarning) {
    pushFlag(flags, "warn", "non-diagnostic-pack-distractors", packDistractorWarning);
  }

  if (
    normalizedDifficulty === "easy" &&
    explanationWordCount > 90 &&
    explanationWordCount > Math.max(45, promptWordCount * 2)
  ) {
    pushFlag(
      flags,
      "warn",
      "overlong-easy-explanation",
      "Easy-item explanation is disproportionately long relative to the stem."
    );
  }

  if (row.section === "english" && (!row.passage || row.passage.trim().length === 0)) {
    findings.sectionAppropriate = "fail";
    pushFlag(flags, "reject", "english-no-passage", "English revision question is missing passage context.");
  }

  if (row.section === "reading" && (!row.passage || row.passage.trim().length === 0)) {
    findings.sectionAppropriate = "fail";
    pushFlag(flags, "reject", "reading-no-passage", "Reading question is missing passage text.");
  }

  if (row.section === "science" && (!row.passage || row.passage.trim().length === 0)) {
    findings.sectionAppropriate = "fail";
    pushFlag(flags, "reject", "science-no-setup", "Science question is missing experiment or data setup.");
  }

  if (
    row.section === "english" &&
    /\b(identify|what is the function|which punctuation mark|what is the subject|define|part of speech|best synonym)\b/.test(
      combinedText
    )
  ) {
    pushFlag(
      flags,
      "reject",
      "english-terminology-quiz",
      "English item reads like terminology recall instead of ACT revision in context."
    );
  }

  if (
    combinedText.includes("underlin") &&
    !hasUnderlineMarkup(row.question_text) &&
    !hasUnderlineMarkup(row.passage)
  ) {
    pushFlag(
      flags,
      "reject",
      "missing-underline-markup",
      "Question refers to underlined text without marking it in the prompt or passage."
    );
  }

  if (
    row.section === "math" &&
    normalizedDifficulty !== "easy" &&
    (
      /a rectangle has length .* what is its area\?/i.test(row.question_text) ||
      /what is the slope of the line passing through/i.test(row.question_text) ||
      /^solve for x:\s*[-\d+x\s=+]+$/i.test(row.question_text) ||
      (row.question_text.trim().length < 85 && allNumericChoices)
    )
  ) {
    pushFlag(
      flags,
      "reject",
      "soft-math-stem",
      "Math item looks too direct or too clean to deserve a medium or hard label."
    );
  }

  if (
    correctAnswer &&
    explanationChoiceMentions.length > 0 &&
    explanationChoiceMentions.some((choice) => choice !== correctAnswer)
  ) {
    pushFlag(
      flags,
      "reject",
      "explanation-answer-mismatch",
      "Explanation points to a different answer choice than the keyed correct answer."
    );
  }

  if (row.section === "math") {
    const discountDistractorMismatches = findDiscountDistractorExplanationMismatch(
      row.question_text,
      choices,
      row.explanation
    );
    if (discountDistractorMismatches) {
      findings.explanationVerified = "fail";
      pushFlag(
        flags,
        "reject",
        "incorrect-distractor-rationale",
        `Explanation assigns an incorrect no-discount result to choice(s) ${discountDistractorMismatches.join(", ")}.`
      );
    }
  }

  if (row.section === "math" && normalizedTopic.includes("geometry")) {
    const geometryConflict = findGeometryLiteralObjectConflict(
      row.question_text,
      row.passage,
      row.explanation
    );
    if (geometryConflict) {
      findings.evidenceSupported = "fail";
      findings.uniqueCorrectAnswer = "fail";
      findings.answerKeyVerified = "fail";
      pushFlag(
        flags,
        "reject",
        "geometry-unstated-segment-extension",
        `The stem says finite segments ${geometryConflict.firstSegment} and ${geometryConflict.secondSegment} intersect at ${geometryConflict.intersectionPoint}, but the explanation places that point beyond a segment endpoint.`
      );
    }
  }

  if (
    row.section === "math" &&
    /\b(closest|nearest|approximately|approximate)\b/i.test(row.explanation) &&
    !/\b(closest|nearest|approximately|approximate|about|round)\b/i.test(row.question_text)
  ) {
    pushFlag(
      flags,
      "reject",
      "unsignaled-approximation",
      "Explanation relies on approximation or nearest-choice reasoning that the prompt never signals."
    );
  }

  if (
    row.section === "reading" &&
    normalizedTopic.includes("literary narrative") &&
    !/\b(he|she|they|i|we|said|thought|looked|walked|felt|remembered|voice|scene|character)\b/i.test(
      combinedText
    )
  ) {
    findings.sectionAppropriate = "fail";
    pushFlag(
      flags,
      "reject",
      "literary-narrative-drift",
      "Reading item is labeled Literary Narrative but does not read like narrative prose."
    );
  }

  if (
    row.section === "reading" &&
    normalizedTopic.includes("social science") &&
    !/\b(society|government|community|economy|economics|psychology|history|citizens|voters|policy|researchers|study|public|culture|labor|market|behavior|historical|anthropology|civics)\b/i.test(
      combinedText
    )
  ) {
    findings.sectionAppropriate = "fail";
    pushFlag(
      flags,
      "warn",
      "social-science-drift",
      "Reading item is labeled Social Science but lacks clear social-science content."
    );
  }

  if (
    row.section === "reading" &&
    normalizedTopic.includes("humanities") &&
    !/\b(art|music|literature|poetry|novel|painting|architecture|philosophy|culture|artist|composer)\b/i.test(
      combinedText
    )
  ) {
    findings.sectionAppropriate = "fail";
    pushFlag(
      flags,
      "warn",
      "humanities-drift",
      "Reading item is labeled Humanities but lacks clear humanities content."
    );
  }

  if (
    row.section === "reading" &&
    normalizedTopic.includes("natural science") &&
    !/\b(scientists|species|cells|planet|chemical|physics|biology|ecosystem|climate|atom|energy)\b/i.test(
      combinedText
    )
  ) {
    findings.sectionAppropriate = "fail";
    pushFlag(
      flags,
      "warn",
      "natural-science-drift",
      "Reading item is labeled Natural Science but lacks clear science content."
    );
  }

  if (isMediumHard && explanationWordCount < 16) {
    pushFlag(
      flags,
      "warn",
      "thin-explanation",
      "Explanation is thin for a medium or hard question and may not show real reasoning depth."
    );
  }

  if (row.section === "english" && isMediumHard) {
    if (passageWordCount < 35) {
      pushFlag(
        flags,
        "warn",
        "thin-english-context",
        "English passage context is short enough that the revision may feel too isolated."
      );
    }

    if (promptWordCount < 9) {
      pushFlag(
        flags,
        "warn",
        "thin-english-stem",
        "English prompt is very short for a medium or hard revision decision."
      );
    }
  }

  if (row.section === "math" && isMediumHard) {
    if (promptWordCount < 14 && !row.passage) {
      pushFlag(
        flags,
        "warn",
        "short-math-stem",
        "Math stem is unusually short for a medium or hard ACT item."
      );
    }

    if (allNumericChoices && promptWordCount < 18) {
      pushFlag(
        flags,
        "warn",
        "clean-numeric-choices",
        "All-numeric choices plus a short stem often signals a soft math item."
      );
    }

    if (/^(solve|what is the value of x|what is x)/i.test(row.question_text.trim())) {
      pushFlag(
        flags,
        "warn",
        "direct-math-ask",
        "Stem opens like a direct classroom drill instead of a fuller ACT setup."
      );
    }

    if (
      /\b([fgh]\s*\(\s*x\s*\)\s*=|[fgh]\s*\(\s*-?\d+\s*\)|5th term|nth term|sum of the first \d+ terms?|value of [fgh]\([^)]+\))\b/i.test(
        row.question_text
      ) &&
      !hasLayeredMathReasoning(row.question_text, row.explanation)
    ) {
      pushFlag(
        flags,
        "warn",
        "formula-substitution-math",
        "Math item leans on direct substitution or a routine sequence plug-in more than ACT-style reasoning."
      );
    }

    if (
      /\b(angle[s]? of a triangle|triangle has angle measures|diameter of 14|radius of \d+|area of a circle|circumference of a circle)\b/i.test(
        row.question_text
      )
    ) {
      pushFlag(
        flags,
        "warn",
        "formula-recall-math",
        "Math item reads like a direct formula recall problem for its labeled difficulty."
      );
    }
  }

  if (row.section === "reading" && isMediumHard) {
    if (passageWordCount < 55) {
      pushFlag(
        flags,
        "warn",
        "short-reading-passage",
        "Reading passage is short enough that the question may not create real passage pressure."
      );
    }

    if (promptWordCount < 10) {
      pushFlag(
        flags,
        "warn",
        "short-reading-stem",
        "Reading stem is very short for a medium or hard discrimination task."
      );
    }

    if (
      !/\b(infer|imply|suggest|tone|attitude|purpose|primarily|main|best supports|evidence|organization|meaning|context)\b/i.test(
        row.question_text
      )
    ) {
      pushFlag(
        flags,
        "warn",
        "low-demand-reading-ask",
        "Reading stem may be too generic to reliably feel like true ACT medium or hard difficulty."
      );
    }
  }

  if (row.section === "english" && isMediumHard) {
    if (!hasUnderlineMarkup(row.question_text) && !hasUnderlineMarkup(row.passage)) {
      pushFlag(
        flags,
        "warn",
        "unmarked-english-revision",
        "English medium or hard item does not mark the exact revision target in context."
      );
    }
  }

  if (row.section === "science" && isMediumHard) {
    if (passageWordCount < 45) {
      pushFlag(
        flags,
        "warn",
        "thin-science-setup",
        "Science setup is short for a medium or hard data or experiment question."
      );
    }

    if (
      !/\b(experiment|study|figure|table|graph|trial|sample|temperature|rate|scientist|researcher|viewpoint|results)\b/i.test(
        combinedText
      )
    ) {
      findings.sectionAppropriate = "fail";
      pushFlag(
        flags,
        "warn",
        "weak-science-signal",
        "Science wording lacks the data or experiment signal expected from stronger ACT-style items."
      );
    }
  }

  if (findings.sectionAppropriate === "unknown") {
    findings.sectionAppropriate = "pass";
  }

  const supportedChoiceStatuses = extractSupportedScienceChoiceStatuses(row, choices);

  if (supportedChoiceStatuses && choices) {
    const supportedChoices = (["A", "B", "C", "D"] as const).filter(
      (choice) => supportedChoiceStatuses[choice] === true
    );

    if (supportedChoices.length === 0) {
      findings.uniqueCorrectAnswer = "fail";
      findings.answerKeyVerified = "fail";
      findings.evidenceSupported = "fail";
      findings.explanationVerified = "fail";
      pushFlag(
        flags,
        "reject",
        "no-supported-choice",
        "The stimulus does not support any answer choice as written."
      );
    } else if (supportedChoices.length > 1) {
      findings.uniqueCorrectAnswer = "fail";
      findings.answerKeyVerified = "fail";
      findings.evidenceSupported = "fail";
      pushFlag(
        flags,
        "reject",
        "multiple-supported-choices",
        "More than one answer choice appears defensibly correct from the stimulus."
      );
    } else {
      findings.uniqueCorrectAnswer = "pass";
      findings.evidenceSupported = "pass";
      findings.answerKeyVerified =
        correctAnswer && supportedChoices[0] === correctAnswer ? "pass" : "fail";
      findings.explanationVerified =
        findings.answerKeyVerified === "pass" ? "pass" : "fail";

      if (correctAnswer && supportedChoices[0] !== correctAnswer) {
        pushFlag(
          flags,
          "reject",
          "unsupported-keyed-answer",
          "The keyed answer is not the uniquely supported choice from the stimulus."
        );
      }
    }
  }

  if (row.section === "science") {
    const parsedMeasurements = extractScienceMeasurements(row.passage);

    if (parsedMeasurements) {
      const explanationContradiction = explanationContradictsScienceStimulus(
        row.explanation,
        parsedMeasurements
      );

      if (explanationContradiction === true) {
        findings.explanationVerified = "fail";
        pushFlag(
          flags,
          "reject",
          "explanation-stimulus-contradiction",
          "The explanation makes a factual claim that the stimulus contradicts."
        );
      }
    }
  }

  if (
    row.section === "science" &&
    /\baccelerat(?:e|es|ed|ion)\b/i.test(`${row.question_text} ${row.explanation} ${choices ? Object.values(choices).join(" ") : ""}`) &&
    !/\b(acceleration|accelerate|rate of change|change in rate|second derivative|slope over time)\b/i.test(
      row.passage ?? ""
    )
  ) {
    findings.evidenceSupported = "fail";
    pushFlag(
      flags,
      "warn",
      "unsupported-acceleration-wording",
      "The item uses acceleration wording that the stimulus may not explicitly support."
    );
  }

  const blockingFlags = flags.filter((flag) => flag.severity === "reject");
  const warningFlags = flags.filter((flag) => flag.severity === "warn");
  const autoPublishEligible =
    blockingFlags.length === 0 &&
    warningFlags.length === 0 &&
    Object.values(findings).every((status) => status === "pass");
  const riskScore =
    blockingFlags.length * 3 +
    warningFlags.length +
    (isMediumHard ? 1 : 0);
  const shouldServe =
    blockingFlags.length === 0 &&
    !(isMediumHard && warningFlags.length >= 2);

  return {
    shouldServe,
    riskScore,
    blockingFlags,
    warningFlags,
    findings,
    autoPublishEligible,
  };
}

export function normalizeQuestionRow(row: {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage: string | null;
  questionSetId?: string | null;
  questionSetKind?: QuestionSetKind | null;
  questionSetTitle?: string | null;
  questionSetContent?: string | null;
  question_text: string;
  choices: unknown;
  correct_answer: string;
  explanation: string;
}) {
  const qualityReview = reviewQuestionQuality(row);
  const correctAnswer = normalizeCorrectAnswer(row.correct_answer);
  const choices = normalizeChoices(row.choices);

  if (!qualityReview.shouldServe || !correctAnswer || !choices || !choices[correctAnswer]) {
    return null;
  }

  return {
    id: row.id,
    section: row.section,
    topic: row.topic,
    difficulty: row.difficulty,
    passage: row.passage,
    questionSetId: row.questionSetId ?? null,
    questionSetKind: row.questionSetKind ?? null,
    questionSetTitle: row.questionSetTitle ?? null,
    questionSetContent: row.questionSetContent ?? null,
    question_text: row.question_text,
    choices,
    correct_answer: correctAnswer,
    explanation: row.explanation,
  } satisfies NormalizedQuestionRow;
}
