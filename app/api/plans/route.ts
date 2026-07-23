import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { createPlan, TOOL_NAMES, type ToolName } from "@/lib/plans";

export async function GET(req: Request) {
  return withUser(async (user) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const plans = await prisma.plan.findMany({
      where: { userId: user.id, ...(status ? { status } : {}) },
      include: { actions: { include: { thread: { select: { subject: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(plans);
  });
}

interface CreatePlanBody {
  kind: string;
  summary: string;
  actions: { tool: string; threadId?: string; payload: Record<string, unknown> }[];
}

export async function POST(req: Request) {
  const body = (await req.json()) as CreatePlanBody;
  return withUser(async (user) => {
    if (!body.kind || !body.summary || !Array.isArray(body.actions) || body.actions.length === 0) {
      return NextResponse.json({ error: "kind, summary, and at least one action are required" }, { status: 400 });
    }
    for (const a of body.actions) {
      if (!TOOL_NAMES.includes(a.tool as ToolName)) {
        return NextResponse.json({ error: `Unknown tool: ${a.tool}` }, { status: 400 });
      }
    }
    const plan = await createPlan({
      userId: user.id,
      kind: body.kind,
      summary: body.summary,
      actions: body.actions.map((a) => ({ tool: a.tool as ToolName, threadId: a.threadId, payload: a.payload })),
    });
    return NextResponse.json(plan, { status: 201 });
  });
}
