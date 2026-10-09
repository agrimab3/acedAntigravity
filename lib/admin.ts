import "server-only";
import { getAuthSession } from "@/lib/auth";

function getAdminEmailSet() {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return getAdminEmailSet().has(email.trim().toLowerCase());
}

export async function getAdminSession() {
  const session = await getAuthSession();
  return isAdminEmail(session?.user?.email) ? session : null;
}
