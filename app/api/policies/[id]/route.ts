import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return withUser(async (user) => {
    const policy = await prisma.policy.findFirst({ where: { id, userId: user.id } });
    if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.policy.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        timeDelay: body.timeDelay ?? undefined,
        scope: body.scope ?? undefined,
        action: body.action ?? undefined,
        tone: body.tone ?? undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      },
    });
    return NextResponse.json(updated);
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const policy = await prisma.policy.findFirst({ where: { id, userId: user.id } });
    if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.policy.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
