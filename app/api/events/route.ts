import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";

export async function GET() {
  return withUser(async (user) => {
    const events = await prisma.calendarEvent.findMany({
      where: { userId: user.id },
      include: { thread: { select: { subject: true } } },
      orderBy: { startTime: "asc" },
    });
    return NextResponse.json(events);
  });
}
