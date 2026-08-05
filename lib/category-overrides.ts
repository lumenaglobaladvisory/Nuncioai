import { prisma } from "@/lib/prisma";
import { TRIAGE_CATEGORIES, type TriageCategory } from "@/lib/llm/types";

const SCOPE = "category_override";

function isTriageCategory(value: unknown): value is TriageCategory {
  return typeof value === "string" && (TRIAGE_CATEGORIES as readonly string[]).includes(value);
}

/** Lowercased sender email -> the category the user last manually corrected mail from them to. Reused across a whole sync pass instead of a per-thread lookup. */
export async function getSenderCategoryOverrides(userId: string): Promise<Map<string, TriageCategory>> {
  const entries = await prisma.memoryEntry.findMany({ where: { userId, scope: SCOPE } });
  const map = new Map<string, TriageCategory>();
  for (const entry of entries) {
    try {
      const data = JSON.parse(entry.data) as { category?: unknown };
      if (isTriageCategory(data.category)) map.set(entry.key.toLowerCase(), data.category);
    } catch {
      // malformed entry - ignore rather than fail the whole sync
    }
  }
  return map;
}

/** Records that the user corrected mail from this sender to `category`, so future threads from them adopt it automatically. */
export async function recordSenderCategoryOverride(
  userId: string,
  senderEmail: string,
  category: TriageCategory
): Promise<void> {
  const key = senderEmail.toLowerCase();
  await prisma.memoryEntry.upsert({
    where: { userId_scope_key: { userId, scope: SCOPE, key } },
    create: { userId, scope: SCOPE, key, data: JSON.stringify({ category }) },
    update: { data: JSON.stringify({ category }) },
  });
}
