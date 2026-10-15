import "server-only";

import { createHash } from "node:crypto";
import type { DeletionDryRunInventory } from "@/lib/account-deletion-dry-run";

export const DELETION_EXECUTION_PLAN_VERSION = "phase2-control-plane-2026-10-15";

export type DeletionExecutionPlan = {
  version: string;
  items: DeletionDryRunInventory["items"];
  holds: DeletionDryRunInventory["holds"];
  unresolvedRules: string[];
  verificationChecklist: Array<{ key: string; category: "aced" | "provider" | "backup"; required: boolean; label: string }>;
};

export function buildDeletionExecutionPlan(inventory: DeletionDryRunInventory): DeletionExecutionPlan {
  return {
    version: DELETION_EXECUTION_PLAN_VERSION,
    items: inventory.items,
    holds: inventory.holds,
    unresolvedRules: inventory.unresolvedRules,
    verificationChecklist: [
      { key: "aced-records", category: "aced", required: true, label: "Recheck approved Aced-controlled categories using aggregate counts only." },
      { key: "terms-history", category: "aced", required: true, label: "Confirm Terms-history retention decision; no bypass of ON DELETE RESTRICT." },
      { key: "payment-review", category: "aced", required: true, label: "Confirm payment, refund, dispute, and tax retention decision." },
      { key: "provider-follow-up", category: "provider", required: true, label: "Confirm approved provider-specific follow-up, if any." },
      { key: "backup-rotation", category: "backup", required: true, label: "Confirm approved backup rotation and restore safeguards." },
    ],
  };
}

export function deletionExecutionPlanDigest(plan: DeletionExecutionPlan) {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

export function blockingKeys(plan: DeletionExecutionPlan) {
  return [...new Set([
    ...plan.holds.map((hold) => hold.key),
    ...plan.unresolvedRules.map((_, index) => `unresolved-rule-${index + 1}`),
  ])];
}

export function canRecordFinalAuthorization(input: {
  preparedByAdminEmail: string;
  authorizingAdminEmail: string;
  blockerKeys: string[];
  planDigestMatches: boolean;
}) {
  return input.preparedByAdminEmail !== input.authorizingAdminEmail
    && input.blockerKeys.length === 0
    && input.planDigestMatches;
}
