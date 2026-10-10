import { z } from "zod";

export const feedbackSchema = z.object({
  source: z.enum(["mock_test", "practice_session", "practice_test", "page_footer"]),
  contextId: z.string().uuid().nullable().optional(),
  pagePath: z.string().startsWith("/").max(500).refine(value => !value.startsWith("//")),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  tags: z.array(z.enum(["the timer", "a confusing question", "the calculator", "the break", "something broke", "nope, all good"])).max(6).nullable().optional(),
  message: z.string().max(1000).nullable().optional(),
}).refine(data => data.rating != null || Boolean(data.tags?.length) || Boolean(data.message?.trim()), "Feedback cannot be empty.")
.refine(data => !(data.tags?.includes("nope, all good") && data.tags.length > 1), "Conflicting tags.");
