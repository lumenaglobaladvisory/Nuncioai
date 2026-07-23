"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemoryEntry, User } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import Badge from "./Badge";

export default function SettingsClient({ user, memories }: { user: User; memories: MemoryEntry[] }) {
  const router = useRouter();
  const [tone, setTone] = useState(user.tonePreference ?? "");
  const [savingTone, setSavingTone] = useState(false);

  const [scope, setScope] = useState<"global" | "recipient" | "client">("recipient");
  const [key, setKey] = useState("");
  const [data, setData] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function saveTone() {
    setSavingTone(true);
    try {
      await apiFetch("/api/user", { method: "PATCH", body: JSON.stringify({ tonePreference: tone }) });
      router.refresh();
    } finally {
      setSavingTone(false);
    }
  }

  async function addMemory(e: React.FormEvent) {
    e.preventDefault();
    setSavingMemory(true);
    try {
      await apiFetch("/api/memory", { method: "POST", body: JSON.stringify({ scope, key, data }) });
      setKey("");
      setData("");
      router.refresh();
    } finally {
      setSavingMemory(false);
    }
  }

  async function removeMemory(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/memory/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-700">Default tone</h2>
        <p className="text-xs text-neutral-500">
          Used as the default when drafting, unless you pick a different tone on a specific thread.
        </p>
        <textarea
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          rows={2}
          placeholder="concise, professional, friendly"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
        <button
          onClick={saveTone}
          disabled={savingTone}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {savingTone ? "Saving..." : "Save"}
        </button>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-700">Recipient &amp; client memory</h2>
        <p className="text-xs text-neutral-500">
          Notes InboxPilot factors into drafts for a specific recipient or client (preferred cadence, past
          agreements, sensitivities).
        </p>
        <form onSubmit={addMemory} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs font-medium text-neutral-500">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
              className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="recipient">recipient</option>
              <option value="client">client</option>
              <option value="global">global</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Key (e.g. email or client name)</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-neutral-500">Notes</label>
            <input
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
              placeholder="Prefers async updates over calls; always CC their assistant."
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={savingMemory}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            Add
          </button>
        </form>
        <ul className="divide-y divide-neutral-200">
          {memories.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <div className="text-sm">
                <Badge label={m.scope} /> <span className="font-medium">{m.key}</span>
                <p className="text-xs text-neutral-500">{m.data}</p>
              </div>
              <button
                onClick={() => removeMemory(m.id)}
                disabled={busyId === m.id}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
          {memories.length === 0 && <li className="py-2 text-sm text-neutral-400">No memory entries yet.</li>}
        </ul>
      </section>
    </>
  );
}
