import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const entry = await prisma.memoryEntry.findFirst({ where: { id, userId: user.id } });
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.memoryEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
