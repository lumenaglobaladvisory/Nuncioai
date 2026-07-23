import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const thread = await prisma.emailThread.findFirst({
      where: { id, connectedAccount: { userId: user.id } },
      include: {
        messages: { orderBy: { sentAt: "asc" } },
        drafts: { orderBy: { createdAt: "desc" } },
        tasks: true,
        events: true,
        connectedAccount: { select: { provider: true, email: true } },
        planActions: { include: { plan: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(thread);
  });
}
