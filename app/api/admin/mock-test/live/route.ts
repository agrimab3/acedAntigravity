import { NextResponse } from "next/server";
import {
  mockTestAdminNotFoundResponse,
  requireMockTestAdminApi,
} from "@/lib/admin/mockTestAdmin";
import { getMockTestLiveOverview } from "@/lib/admin/mockTestLive";

export async function GET(request: Request) {
  const session = await requireMockTestAdminApi();
  if (!session) return mockTestAdminNotFoundResponse();

  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing mock test slug." }, { status: 400 });
  }

  const overview = await getMockTestLiveOverview(slug);
  if (!overview) {
    return NextResponse.json({ error: "Mock test not found." }, { status: 404 });
  }

  return NextResponse.json(
    { overview },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    }
  );
}
