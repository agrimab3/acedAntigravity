import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { getAdminQuestionHealthReport } from "@/lib/admin-question-health";

export async function GET() {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const report = await getAdminQuestionHealthReport();
    return NextResponse.json(report);
  } catch (error) {
    console.error("[admin-question-health] Failed to build report", error);
    return NextResponse.json(
      { error: "Unable to build question health report." },
      { status: 500 }
    );
  }
}
