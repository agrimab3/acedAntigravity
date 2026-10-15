import "server-only";

export const deletionRequestStatuses = [
  "requested",
  "reviewing",
  "awaiting_clarification",
  "blocked",
] as const;

export const identityVerificationStatuses = [
  "not_started",
  "pending",
  "verified",
] as const;

export type DeletionRequestStatus = (typeof deletionRequestStatuses)[number] | "completed";
export type IdentityVerificationStatus = (typeof identityVerificationStatuses)[number];

const allowedTransitions: Record<Exclude<DeletionRequestStatus, "completed">, readonly DeletionRequestStatus[]> = {
  requested: ["requested", "reviewing", "awaiting_clarification", "blocked"],
  reviewing: ["reviewing", "awaiting_clarification", "blocked"],
  awaiting_clarification: ["awaiting_clarification", "reviewing", "blocked"],
  blocked: ["blocked", "reviewing", "awaiting_clarification"],
};

/**
 * A request may only move through non-destructive review states here. `completed`
 * is deliberately never a target; it must be recorded only by a future, separately
 * authorized deletion-execution procedure after deletion has been verified.
 */
export function canTransitionDeletionRequest(
  from: DeletionRequestStatus,
  to: DeletionRequestStatus,
) {
  return from !== "completed" && to !== "completed" && allowedTransitions[from].includes(to);
}
