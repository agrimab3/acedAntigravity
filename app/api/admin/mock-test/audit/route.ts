import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  mockTestAdminNotFoundResponse,
  requireMockTestAdminApi,
} from "@/lib/admin/mockTestAdmin";

export async function GET(request: Request) {
  const admin = await requireMockTestAdminApi();
  if (!admin) return mockTestAdminNotFoundResponse();

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 500 });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const action = url.searchParams.get("action")?.trim() || null;
  const adminEmail = url.searchParams.get("admin")?.trim().toLowerCase() || null;
  if (!slug) {
    return NextResponse.json({ error: "Missing mock test slug." }, { status: 400 });
  }

  const result = await db.execute(sql`
    select aal.id, aal.admin_email, aal.action, aal.target,
           aal.details, aal.reason, aal.created_at
    from admin_audit_log aal
    where (
      aal.target = (select id::text from mock_tests where slug=${slug})
      or aal.target in (
        select mr.id::text
        from mock_registrations mr
        inner join mock_tests mt on mt.id=mr.mock_test_id
        where mt.slug=${slug}
      )
    )
      and (${action}::text is null or aal.action=${action})
      and (${adminEmail}::text is null or lower(aal.admin_email)=${adminEmail})
    order by aal.created_at desc
    limit 300
  `);

  return NextResponse.json(
    {
      entries: result.rows.map((row) => ({
        id: String(row.id),
        adminEmail: String(row.admin_email),
        action: String(row.action),
        target: String(row.target),
        details: row.details,
        reason: String(row.reason),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : new Date(String(row.created_at)).toISOString(),
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    }
  );
}
