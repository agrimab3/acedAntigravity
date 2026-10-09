import { DM_Sans, Playfair_Display } from "next/font/google";
import { redirect } from "next/navigation";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { canBypassMockEventWindow, getPaidMockRegistration } from "@/lib/mockTest/runner";
import MockTestRunner from "./runner-client";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export default async function MockTestRunPage() {
  const user = await getMockTestUser();
  if (!user) redirect("/mock-test/signup");

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) redirect("/mock-test/signup");
  if (registration.finishedAt) redirect("/mock-test/run/finished");

  return (
    <div className={playfair.variable + " " + dmSans.variable}>
      <MockTestRunner
        email={user.email}
        timeZone={registration.timeZone}
        allowDevReset={canBypassMockEventWindow()}
      />
    </div>
  );
}
