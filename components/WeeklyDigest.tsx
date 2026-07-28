"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Archive } from "lucide-react";
import type { DigestItem, WeeklyDigest as WeeklyDigestData } from "@/lib/stats";

function DigestRow({ item }: { item: DigestItem }) {
  return (
    <Link
      href={`/threads/${item.id}`}
      className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-neutral-50"
    >
      <div className="min-w-0">
        <p className="truncate text-neutral-800">{item.subject}</p>
        <p className="truncate text-xs text-neutral-400">{item.fromLabel}</p>
      </div>
      <span className="shrink-0 text-xs text-neutral-400">{new Date(item.lastMessageAt).toLocaleDateString()}</span>
    </Link>
  );
}

export default function WeeklyDigest({ digest }: { digest: WeeklyDigestData }) {
  const [open, setOpen] = useState(false);
  const total = digest.noise.length + digest.fyi.length;
  if (total === 0) return null;

  return (
    <details className="group rounded-xl border border-neutral-200 bg-white" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-700">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Archive className="h-3.5 w-3.5 text-neutral-400" strokeWidth={2} />
        This week&apos;s digest
        <span className="text-neutral-400">({total} low-value email{total === 1 ? "" : "s"} kept out of your way)</span>
      </summary>
      <div className="space-y-4 border-t border-neutral-100 px-2 pb-3 pt-2">
        {digest.noise.length > 0 && (
          <div>
            <p className="px-2.5 pb-1 text-xs font-medium text-neutral-400">Noise ({digest.noise.length})</p>
            {digest.noise.map((item) => (
              <DigestRow key={item.id} item={item} />
            ))}
          </div>
        )}
        {digest.fyi.length > 0 && (
          <div>
            <p className="px-2.5 pb-1 text-xs font-medium text-neutral-400">FYI ({digest.fyi.length})</p>
            {digest.fyi.map((item) => (
              <DigestRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
