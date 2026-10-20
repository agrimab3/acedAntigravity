import DashboardClient from "./dashboard-client";
import LiveLessonCard from "@/components/LiveLessonCard";
import { getAuthSession } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getAuthSession();
  return <DashboardClient liveLessonCard={session?.user ? <LiveLessonCard /> : null} />;
}
