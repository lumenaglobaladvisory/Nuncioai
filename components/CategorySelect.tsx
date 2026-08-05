"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const CATEGORIES = ["must_respond_today", "review_this_week", "fyi", "noise"] as const;

export default function CategorySelect({
  threadId,
  category,
  onChanged,
}: {
  threadId: string;
  category: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setBusy(true);
    try {
      await apiFetch(`/api/threads/${threadId}/recategorize`, { method: "PATCH", body: JSON.stringify({ category: next }) });
      onChanged();
    } catch {
      // best-effort - the select will just snap back to the server value on next refresh
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={category ?? "fyi"}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      disabled={busy}
      title="Not right? Relabel it - InboxPilot will remember this for the sender."
      className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px] text-neutral-500 disabled:opacity-50"
    >
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
