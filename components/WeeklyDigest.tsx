"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, Archive } from "lucide-react";
import type { DigestItem, WeeklyDigest as WeeklyDigestData } from "@/lib/stats";
import CategorySelect from "./CategorySelect";

function DigestRow({ item, onRecategorized }: { item: DigestItem; onRecategorized: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-neutral-50">
      <Link href={`/threads/${item.id}`} className="min-w-0 flex-1">
        <p className="truncate text-neutral-800">{item.subject}</p>
        <p className="truncate text-xs text-neutral-400">{item.fromLabel}</p>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs text-neutral-400">{new Date(item.lastMessageAt).toLocaleDateString()}</span>
        <CategorySelect threadId={item.id} category={item.category} onChanged={onRecategorized} />
      </div>
    </div>
  );
}

export default function WeeklyDigest({ digest }: { digest: WeeklyDigestData }) {
  const router = useRouter();
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
              <DigestRow key={item.id} item={item} onRecategorized={() => router.refresh()} />
            ))}
          </div>
        )}
        {digest.fyi.length > 0 && (
          <div>
            <p className="px-2.5 pb-1 text-xs font-medium text-neutral-400">FYI ({digest.fyi.length})</p>
            {digest.fyi.map((item) => (
              <DigestRow key={item.id} item={item} onRecategorized={() => router.refresh()} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
