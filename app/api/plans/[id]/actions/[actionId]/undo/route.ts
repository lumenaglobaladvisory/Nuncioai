import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { undoPlanAction } from "@/lib/plans";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  const { id, actionId } = await params;
  return withUser(async (user) => {
    const plan = await prisma.plan.findFirst({ where: { id, userId: user.id } });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const action = await prisma.planAction.findFirst({ where: { id: actionId, planId: id } });
    if (!action) return NextResponse.json({ error: "Action not found" }, { status: 404 });
    try {
      const undone = await undoPlanAction(actionId);
      return NextResponse.json(undone);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Undo failed" }, { status: 400 });
    }
  });
}
