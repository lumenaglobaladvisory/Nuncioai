import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { getCalendarProvider } from "@/lib/providers";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const event = await prisma.calendarEvent.findFirst({
      where: { id, userId: user.id },
      include: { thread: { include: { connectedAccount: true } } },
    });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (event.providerEventId && event.thread) {
      const calendar = getCalendarProvider(event.thread.connectedAccount);
      await calendar.deleteEvent(event.providerEventId).catch(() => undefined);
    }
    await prisma.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
