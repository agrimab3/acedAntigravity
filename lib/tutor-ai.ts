import { generateGeminiText, hasGeminiApiKey } from "@/lib/gemini";
import {
  resolveGroqFallbackModel,
  resolvePreferredGroqModel,
} from "@/lib/groq-models";

type TutorAiOptions = {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
};

type TutorAiResult = {
  text: string;
  provider: "gemini" | "groq";
};

export function hasTutorAiProvider() {
  return hasGeminiApiKey() || Boolean(process.env.GROQ_API_KEY);
}

async function generateGroqTutorText({
  options,
  model,
}: {
  options: TutorAiOptions;
  model: string;
}) {
  const {
    systemInstruction,
    prompt,
    temperature = 0.3,
    maxOutputTokens = 180,
  } = options;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Groq API key.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt },
      ],
      temperature,
      max_tokens: maxOutputTokens,
      reasoning_effort: "low",
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      `Groq tutor request failed (${response.status}): ${payload.error?.message || "unknown error"}`
    );
  }

  const choice = payload.choices?.[0];
  const text = choice?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("Groq returned an empty tutor response.");
  }
  if (choice?.finish_reason === "length") {
    throw new Error("Groq tutor response was truncated.");
  }

  return text;
}

export async function generateTutorAiText(options: TutorAiOptions): Promise<TutorAiResult> {
  const failures: string[] = [];

  if (hasGeminiApiKey()) {
    try {
      const text = await generateGeminiText(options);
      return { text, provider: "gemini" };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (process.env.GROQ_API_KEY) {
    const preferredModel = resolvePreferredGroqModel(process.env.GROQ_MODEL);
    const fallbackModel = resolveGroqFallbackModel(preferredModel);

    for (const model of Array.from(new Set([preferredModel, fallbackModel]))) {
      try {
        const text = await generateGroqTutorText({ options, model });
        return { text, provider: "groq" };
      } catch (error) {
        failures.push(
          `${model}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  throw new Error(
    failures.length > 0
      ? `Tutor AI providers unavailable: ${failures.join(" | ")}`
      : "No tutor AI provider is configured."
  );
}
