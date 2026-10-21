import { NextResponse } from "next/server";
import { z } from "zod";
import { mockTestAdminNotFoundResponse, requireMockTestAdminApi } from "@/lib/admin/mockTestAdmin";
import { processMockEmailOutbox, queueWelcomeEmail } from "@/lib/mockTest/email-outbox";

const schema = z.object({ userId: z.string().uuid() });

// Admin-only: send the welcome email to a student who signed up before it existed.
// Keyed per user, so pressing it twice never sends twice.
export async function POST(request: Request) {
  const session = await requireMockTestAdminApi();
  if (!session) return mockTestAdminNotFoundResponse();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const result = await queueWelcomeEmail(parsed.data.userId);
  const sent = await processMockEmailOutbox(new Date());
  return NextResponse.json({ queued: result.queued, sent: sent.sent, failed: sent.failed });
}
