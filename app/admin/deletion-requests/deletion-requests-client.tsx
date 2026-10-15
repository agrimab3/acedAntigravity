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
        </>}
      </article>)}
      {rows.length === 0 && <p>No deletion requests.</p>}
    </div>
  </>;
}
