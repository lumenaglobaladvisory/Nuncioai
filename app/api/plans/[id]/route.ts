import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const plan = await prisma.plan.findFirst({
      where: { id, userId: user.id },
      include: { actions: { include: { thread: { select: { subject: true } } } } },
    });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(plan);
  });
}

// Reject a pending plan - the AI's proposal is simply discarded, nothing
// external has happened yet so there's nothing to undo.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const plan = await prisma.plan.findFirst({ where: { id, userId: user.id } });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (plan.status !== "pending") {
      return NextResponse.json({ error: `Only pending plans can be rejected (status: ${plan.status})` }, { status: 400 });
    }
    await prisma.planAction.updateMany({ where: { planId: id }, data: { status: "skipped" } });
    const updated = await prisma.plan.update({ where: { id }, data: { status: "rejected" } });
    return NextResponse.json(updated);
  });
}
