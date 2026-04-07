import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const tutorRequestSchema = z.object({
  message: z.string().trim().min(1),
  question: z.string().trim().min(1),
  section: z.string().trim().min(1),
  topic: z.string().trim().optional(),
  explanation: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const parsed = tutorRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid tutor payload.' }, { status: 400 });
  }

  if (!client) {
    return NextResponse.json({
      reply: 'The AI tutor is not configured yet. Add OPENAI_API_KEY on the server to enable it.',
    });
  }

  const { message, question, section, topic, explanation } = parsed.data;

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    max_output_tokens: 250,
    input: `You are a friendly ACT tutor helping a high school student. Keep responses short, encouraging, and conversational like a smart friend, not a textbook. Use simple language.

Context:
- ACT Section: ${section}
- Topic: ${topic}
- Question: ${question}
- Correct explanation: ${explanation}

Student asks: ${message}`,
  });

  const reply = response.output_text?.trim() || 'let me think about that!';
  return NextResponse.json({ reply });
}
