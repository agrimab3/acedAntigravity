import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = file => readFileSync(file, "utf8");
const { feedbackSchema } = await import("../lib/feedback/validation.ts");
test("validation accepts ratings, tags or messages and rejects empty/invalid payloads", () => {
 const base = { source: "page_footer", pagePath: "/dashboard" };
 for (const input of [{ rating: 4 }, { tags: ["the timer"] }, { message: "helpful" }]) assert.equal(feedbackSchema.safeParse({ ...base, ...input }).success, true);
 for (const input of [{}, { message: "   " }, { rating: 0 }, { rating: 6 }, { message: "x".repeat(1001) }, { tags: ["invalid"] }, { pagePath: "//bad", rating: 2 }]) assert.equal(feedbackSchema.safeParse({ ...base, ...input }).success, false);
});
test("feedback API validates inputs and rejects empty feedback", () => {
 const validation = read("lib/feedback/validation.ts");
 assert.match(validation, /rating != null.*tags.*message/);
 assert.match(validation, /max\(1000\)/);
 assert.match(validation, /\.min\(1\)\.max\(5\)/);
 assert.match(read("app/api/feedback/route.ts"), /feedbackSchema.safeParse\(body\)/);
});
test("rate limit is ten submissions per hour by user or IP", () => {
 const route = read("app/api/feedback/route.ts");
 assert.match(route, /recent.length >= 10/);
 assert.match(route, /3600000/);
 assert.match(route, /userId \? .*user:.*ip:/);
});
test("one feedback per user and context updates previous record", () => {
 const route = read("app/api/feedback/route.ts");
 assert.match(route, /eq\(feedback.userId, userId\)/);
 assert.match(route, /eq\(feedback.contextId, values.contextId\)/);
 assert.match(route, /db.update\(feedback\)/);
 assert.match(read("drizzle/0026_robust_zarda.sql"), /CREATE UNIQUE INDEX "feedback_user_context_idx"/);
});
test("admin feedback route is restricted server-side", () => {
 assert.match(read("app/api/admin/feedback/route.ts"), /if \(!await getAdminSession\(\)\).*404/);
 assert.match(read("app/admin/feedback/page.tsx"), /await requireMockTestAdminPage\(\)/);
});
test("tutor formatting uses safe React markup and shared component", () => {
 const component = read("components/TutorMessage.tsx");
 assert.match(component, /<strong/);
 assert.match(component, /<em/);
 assert.match(component, /<QuestionContent/);
 assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
 for (const file of ["app/practice/page.tsx","app/practice/review/page.tsx"])
   assert.match(read(file), /<TutorMessage text=/);
});
