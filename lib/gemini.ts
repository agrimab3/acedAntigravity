type GeminiJsonSchema = Record<string, unknown>;

type GeminiGenerateOptions = {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseJsonSchema?: GeminiJsonSchema;
};

type GeminiCandidatePart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiCandidatePart[];
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
    status?: string;
  };
};

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function resolveGeminiBaseUrl() {
  const configured = process.env.GEMINI_API_BASE_URL || process.env.GEMINI_BASE_URL;

  if (!configured) {
    return DEFAULT_GEMINI_BASE_URL;
  }

  return configured.replace(/\/openai\/?$/, "").replace(/\/$/, "");
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function extractGeminiText(payload: GeminiResponse) {
  return (
    payload.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function buildGeminiErrorMessage(status: number, payload: GeminiResponse | null, fallback: string) {
  const providerMessage = payload?.error?.message || payload?.promptFeedback?.blockReason;

  return providerMessage
    ? `Gemini request failed (${status}): ${providerMessage}`
    : `Gemini request failed (${status}): ${fallback}`;
}

export function hasGeminiApiKey() {
  return Boolean(getGeminiApiKey());
}

export async function generateGeminiText({
  prompt,
  systemInstruction,
  model = process.env.GEMINI_MODEL || "gemini-2.5-flash",
  temperature = 0.4,
  maxOutputTokens = 240,
  responseMimeType,
  responseJsonSchema,
}: GeminiGenerateOptions) {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const response = await fetch(`${resolveGeminiBaseUrl()}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: systemInstruction
        ? {
            parts: [{ text: systemInstruction }],
          }
        : undefined,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
        ...(responseMimeType ? { responseMimeType } : {}),
        ...(responseJsonSchema ? { responseJsonSchema } : {}),
      },
    }),
    cache: "no-store",
  });

  const fallbackBody = await response.text();
  let payload: GeminiResponse | null = null;

  try {
    payload = fallbackBody ? (JSON.parse(fallbackBody) as GeminiResponse) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(buildGeminiErrorMessage(response.status, payload, fallbackBody || "unknown"));
  }

  const text = payload ? extractGeminiText(payload) : fallbackBody.trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

export async function generateGeminiJson<T>(
  options: GeminiGenerateOptions & {
    schema: GeminiJsonSchema;
    parse: (value: unknown) => T;
  }
) {
  const text = await generateGeminiText({
    ...options,
    responseMimeType: "application/json",
    responseJsonSchema: options.schema,
  });

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Gemini returned invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`
    );
  }

  return options.parse(parsed);
}
