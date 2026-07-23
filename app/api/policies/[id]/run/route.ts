import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { evaluatePolicy } from "@/lib/policies";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const policy = await prisma.policy.findFirst({ where: { id, userId: user.id } });
    if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await evaluatePolicy(user.id, policy);
    return NextResponse.json(result);
  });
}
