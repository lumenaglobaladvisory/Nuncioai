import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { executePlan } from "@/lib/plans";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const plan = await prisma.plan.findFirst({ where: { id, userId: user.id } });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (plan.status !== "approved") {
      return NextResponse.json({ error: `Plan must be approved before executing (status: ${plan.status})` }, { status: 400 });
    }
    const executed = await executePlan(id);
    const withActions = await prisma.plan.findUnique({ where: { id: executed.id }, include: { actions: true } });
    return NextResponse.json(withActions);
  });
}
