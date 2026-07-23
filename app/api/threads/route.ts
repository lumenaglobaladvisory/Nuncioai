import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { getTodayList } from "@/lib/triage";

export async function GET(req: Request) {
  return withUser(async (user) => {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") ?? "today";

    if (scope === "today") {
      const today = await getTodayList(user.id);
      return NextResponse.json(today.map(({ thread, reason }) => ({ ...thread, reason })));
    }

    const category = searchParams.get("category");
    const threads = await prisma.emailThread.findMany({
      where: {
        connectedAccount: { userId: user.id },
        isArchived: scope === "archived" ? true : false,
        ...(category ? { category } : {}),
      },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    });
    return NextResponse.json(threads);
  });
}
