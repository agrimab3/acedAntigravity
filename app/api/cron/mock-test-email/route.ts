import { NextResponse } from "next/server";
import {
  processMockEmailOutbox,
  reconcileMockTestEmailOutbox,
} from "@/lib/mockTest/email-outbox";
import { NEXT_MOCK } from "@/lib/mockTests";
import {
  isAuthorizedStagingEmailWorker,
  isStagingEmailDeliveryEnabled,
} from "@/lib/mockTest/staging-email-worker";

/** Private loopback endpoint used only by the isolated staging PM2 worker. */
export async function GET(request: Request) {
  if (!isAuthorizedStagingEmailWorker(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isStagingEmailDeliveryEnabled()) {
    return NextResponse.json({ delivery: "disabled" });
  }

  try {
    await reconcileMockTestEmailOutbox(NEXT_MOCK.mockTestSlug);
    const summary = await processMockEmailOutbox();
    return NextResponse.json({ delivery: "processed", ...summary });
  } catch {
    return NextResponse.json({ error: "Staging email processing failed." }, { status: 500 });
  }
}
