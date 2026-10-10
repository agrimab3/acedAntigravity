import { requireMockTestAdminPage } from "@/lib/admin/mockTestAdmin";
import FeedbackAdmin from "./FeedbackAdmin";
export const metadata = { title: "Beta Feedback · ACED Admin", robots: { index: false, follow: false } };
export default async function Page() {
  await requireMockTestAdminPage();
  return <FeedbackAdmin />;
}
