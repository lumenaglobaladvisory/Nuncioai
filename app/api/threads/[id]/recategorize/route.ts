import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { recordSenderCategoryOverride } from "@/lib/category-overrides";
import { TRIAGE_CATEGORIES, type TriageCategory } from "@/lib/llm/types";

function isTriageCategory(value: unknown): value is TriageCategory {
  return typeof value === "string" && (TRIAGE_CATEGORIES as readonly string[]).includes(value);
}

// Manual correction endpoint: the user is telling us the AI got a thread
// wrong. This both fixes the one thread (permanently - sync never
// reclassifies a manually-labeled thread again) and remembers the sender, so
// other/future threads from them start out right too.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!isTriageCategory(body?.category)) {
    return NextResponse.json({ error: "category must be one of: " + TRIAGE_CATEGORIES.join(", ") }, { status: 400 });
  }
  const category = body.category;

  return withUser(async (user) => {
    const thread = await prisma.emailThread.findFirst({
      where: { id, connectedAccount: { userId: user.id } },
      include: { messages: { orderBy: { sentAt: "asc" } } },
    });
    if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const needsPriority = category === "must_respond_today" || category === "review_this_week";
    const updated = await prisma.emailThread.update({
      where: { id: thread.id },
      data: {
        category,
        categoryLocked: true,
        priority: needsPriority ? thread.priority ?? "medium" : null,
        priorityReasons: JSON.stringify(["You manually categorized this thread."]),
      },
    });

    const lastInbound = [...thread.messages].reverse().find((m) => m.direction === "inbound");
    if (lastInbound) {
      await recordSenderCategoryOverride(user.id, lastInbound.fromEmail, category);
    }

    return NextResponse.json(updated);
  });
}
