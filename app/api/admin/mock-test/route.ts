import { NextResponse } from "next/server";
import {
  getMockTestAdminPicker,
  mockTestAdminNotFoundResponse,
  requireMockTestAdminApi,
} from "@/lib/admin/mockTestAdmin";

export async function GET(request: Request) {
  const session = await requireMockTestAdminApi();
  if (!session) return mockTestAdminNotFoundResponse();

  const slug = new URL(request.url).searchParams.get("slug");
  const picker = await getMockTestAdminPicker(slug);

  return NextResponse.json(
    {
      tests: picker.tests,
      selected: picker.selected,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    }
  );
}
