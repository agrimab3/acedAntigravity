"use client";

import { useState } from "react";

type RequestRow = {
  id: string;
  email: string;
  status: "requested" | "reviewing" | "awaiting_clarification" | "blocked" | "completed";
  identityVerificationStatus: "not_started" | "pending" | "verified";
  internalNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  lastStatusUpdatedAt: string | null;
};

type DryRunInventory = {
  dryRunOnly: true;
  items: Array<{ key: string; label: string; count: number | null; category: string; relationship: string; note: string }>;
  holds: Array<{ key: string; severity: "pause" | "review"; message: string }>;
  unresolvedRules: string[];
};

type ExecutionPlan = {
  id: string;
  status: string;
  planVersion: string;
  blockerKeys: string[];
  preparedAt: string;
  finalAuthorizedAt: string | null;
  failureCode: string | null;
  frozenPlan: DryRunInventory & { verificationChecklist: Array<{ key: string; category: string; required: boolean; label: string }> };
};

const statusLabels: Record<RequestRow["status"], string> = {
  requested: "Requested",
  reviewing: "Under review",
  awaiting_clarification: "Awaiting clarification",
  blocked: "Blocked",
  completed: "Completed (legacy)",
};

export default function DeletionRequestsClient({ initialRows }: { initialRows: RequestRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadingDryRun, setLoadingDryRun] = useState<string | null>(null);
  const [dryRuns, setDryRuns] = useState<Record<string, DryRunInventory>>({});
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [executionPlans, setExecutionPlans] = useState<Record<string, ExecutionPlan>>({});
  const [notice, setNotice] = useState("");

  async function save(row: RequestRow) {
    if (row.status === "completed") return;
    setSaving(row.id); setNotice("");
    const response = await fetch(`/api/admin/deletion-requests/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: row.status,
        identityVerificationStatus: row.identityVerificationStatus,
        internalNote: row.internalNote,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(data?.error ?? "Could not save this review update.");
    } else {
      setRows((current) => current.map((item) => item.id === row.id
        ? { ...item, ...data.request, lastStatusUpdatedAt: data.request.lastStatusUpdatedAt ?? item.lastStatusUpdatedAt }
        : item));
      setNotice("Review update saved. This did not delete any account data.");
    }
    setSaving(null);
  }

  function change(id: string, patch: Partial<RequestRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  async function loadDryRun(requestId: string) {
    setLoadingDryRun(requestId); setNotice("");
    const response = await fetch(`/api/admin/deletion-requests/${requestId}/dry-run`);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.inventory?.dryRunOnly) {
      setNotice(data?.error ?? "Could not load the dry-run inventory.");
    } else {
      setDryRuns((current) => ({ ...current, [requestId]: data.inventory }));
    }
    setLoadingDryRun(null);
  }

  async function loadExecutionPlan(requestId: string) {
    setLoadingPlan(requestId); setNotice("");
    const response = await fetch(`/api/admin/deletion-requests/${requestId}/execution-plan`);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.execution) setNotice(data?.error ?? "No Phase 2 plan is available yet.");
    else setExecutionPlans((current) => ({ ...current, [requestId]: data.execution }));
    setLoadingPlan(null);
  }

  async function prepareExecutionPlan(requestId: string) {
    setLoadingPlan(requestId); setNotice("");
    const response = await fetch(`/api/admin/deletion-requests/${requestId}/execution-plan`, { method: "POST" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.execution) setNotice(data?.error ?? "Could not prepare the Phase 2 plan.");
    else {
      setExecutionPlans((current) => ({ ...current, [requestId]: data.execution }));
      setNotice(data.created ? "Frozen Phase 2 plan created. It is non-destructive and may be blocked." : "Existing frozen Phase 2 plan loaded.");
    }
    setLoadingPlan(null);
  }

  return <>
    <p>These start a review process only. Never mark a request complete here: there is no deletion action on this page.</p>
    {notice && <p role="status">{notice}</p>}
    <div style={{ display: "grid", gap: 16 }}>
      {rows.map((row) => <article key={row.id} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16 }}>
        <p><strong>{row.email}</strong></p>
        <p>Requested: {new Date(row.requestedAt).toLocaleString()}</p>
        {row.lastStatusUpdatedAt && <p>Last review update: {new Date(row.lastStatusUpdatedAt).toLocaleString()}</p>}
        {row.status === "completed" ? <p>Status: <strong>{statusLabels.completed}</strong>. This legacy record is read-only.</p> : <>
          <label>Status<br /><select value={row.status} onChange={(event) => change(row.id, { status: event.target.value as RequestRow["status"] })}>
            {(["requested", "reviewing", "awaiting_clarification", "blocked"] as const).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select></label>{" "}
          <label>Identity verification<br /><select value={row.identityVerificationStatus} onChange={(event) => change(row.id, { identityVerificationStatus: event.target.value as RequestRow["identityVerificationStatus"] })}>
            <option value="not_started">Not started</option><option value="pending">Pending</option><option value="verified">Verified</option>
          </select></label>
          <label style={{ display: "block", marginTop: 12 }}>Internal note (admin only)<br /><textarea value={row.internalNote ?? ""} maxLength={2000} rows={3} style={{ width: "100%" }} onChange={(event) => change(row.id, { internalNote: event.target.value || null })} /></label>
          <button type="button" disabled={saving === row.id} onClick={() => void save(row)} style={{ marginTop: 12 }}>{saving === row.id ? "Saving…" : "Save review update"}</button>
          {row.identityVerificationStatus === "verified" ? <button type="button" disabled={loadingDryRun === row.id} onClick={() => void loadDryRun(row.id)} style={{ marginTop: 12, marginLeft: 8 }}>{loadingDryRun === row.id ? "Loading…" : "View deletion impact dry run"}</button> : <p>Verify identity before viewing the deletion impact dry run.</p>}
          {dryRuns[row.id] ? <section aria-label="Deletion impact dry run" style={{ marginTop: 16, border: "2px solid #b45309", borderRadius: 8, padding: 12, background: "#fffbeb" }}>
            <strong>DRY RUN ONLY — no data will be deleted, anonymized, or changed.</strong>
            <h3>Execution holds</h3>
            <ul>{dryRuns[row.id].holds.map((hold) => <li key={hold.key}><strong>{hold.severity === "pause" ? "Pause" : "Review"}:</strong> {hold.message}</li>)}</ul>
            <h3>Impact inventory</h3>
            <table><thead><tr><th>Category</th><th>Records</th><th>Relationship</th><th>Notes</th></tr></thead><tbody>{dryRuns[row.id].items.map((item) => <tr key={item.key}><td>{item.label}<br /><small>{item.category}</small></td><td>{item.count ?? "Manual review"}</td><td>{item.relationship}</td><td>{item.note}</td></tr>)}</tbody></table>
            <h3>Unresolved rules</h3>
            <ul>{dryRuns[row.id].unresolvedRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
          </section> : null}
          {row.identityVerificationStatus === "verified" ? <section style={{ marginTop: 16, border: "1px solid #7c3aed", borderRadius: 8, padding: 12, background: "#faf5ff" }}>
            <strong>PHASE 2 CONTROL PLANE — execution disabled</strong>
            <p>Preparing a plan records aggregate counts, blockers, and a verification checklist only. It cannot delete, anonymize, purge, or contact providers.</p>
            <button type="button" disabled={loadingPlan === row.id} onClick={() => void prepareExecutionPlan(row.id)}>{loadingPlan === row.id ? "Preparing…" : "Prepare frozen Phase 2 plan"}</button>{" "}
            <button type="button" disabled={loadingPlan === row.id} onClick={() => void loadExecutionPlan(row.id)}>{loadingPlan === row.id ? "Loading…" : "View existing Phase 2 plan"}</button>
            {executionPlans[row.id] ? <div style={{ marginTop: 12 }}>
              <p><strong>Approval state:</strong> {executionPlans[row.id].status}. Final authorization: disabled. {executionPlans[row.id].failureCode ? `Reason: ${executionPlans[row.id].failureCode}.` : ""}</p>
              <p><strong>Frozen:</strong> {new Date(executionPlans[row.id].preparedAt).toLocaleString()} · <strong>Plan:</strong> {executionPlans[row.id].planVersion}</p>
              <h3>Blockers</h3><ul>{executionPlans[row.id].blockerKeys.map((key) => <li key={key}>{key}</li>)}</ul>
              <h3>Planned actions</h3><table><thead><tr><th>Category</th><th>Records</th><th>Relationship</th></tr></thead><tbody>{executionPlans[row.id].frozenPlan.items.map((item) => <tr key={item.key}><td>{item.label}<br /><small>{item.category}</small></td><td>{item.count ?? "Manual review"}</td><td>{item.relationship}</td></tr>)}</tbody></table>
              <h3>Verification checklist</h3><ul>{executionPlans[row.id].frozenPlan.verificationChecklist.map((item) => <li key={item.key}>{item.required ? "Required: " : ""}{item.label}</li>)}</ul>
              <button type="button" disabled title="Final authorization and destructive execution are intentionally disabled.">Final authorization disabled</button>
            </div> : null}
          </section> : null}
        </>}
      </article>)}
      {rows.length === 0 && <p>No deletion requests.</p>}
    </div>
  </>;
}
