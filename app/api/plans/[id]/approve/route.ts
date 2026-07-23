import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { approvePlan } from "@/lib/plans";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const skipActionIds: string[] = Array.isArray(body?.skipActionIds) ? body.skipActionIds : [];

  return withUser(async (user) => {
    const plan = await prisma.plan.findFirst({ where: { id, userId: user.id } });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (plan.status !== "pending") {
      return NextResponse.json({ error: `Plan is already ${plan.status}` }, { status: 400 });
    }
    const updated = await approvePlan(id, skipActionIds);
    return NextResponse.json(updated);
  });
}
