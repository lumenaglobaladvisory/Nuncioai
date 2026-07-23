import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { undoPlan } from "@/lib/plans";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const plan = await prisma.plan.findFirst({ where: { id, userId: user.id } });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (plan.status !== "executed") {
      return NextResponse.json({ error: `Only executed plans can be undone (status: ${plan.status})` }, { status: 400 });
    }
    const undone = await undoPlan(id);
    const withActions = await prisma.plan.findUnique({ where: { id: undone.id }, include: { actions: true } });
    return NextResponse.json(withActions);
  });
}
