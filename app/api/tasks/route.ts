import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";

export async function GET(req: Request) {
  return withUser(async (user) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const tasks = await prisma.task.findMany({
      where: { userId: user.id, ...(status ? { status } : {}) },
      include: { thread: { select: { subject: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(tasks);
  });
}

interface CreateTaskBody {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: string;
}

// Direct creation for user-authored tasks (no AI proposal, no external
// side effect) - AI-extracted tasks go through POST /api/plans instead so
// they're reviewable before being added.
export async function POST(req: Request) {
  const body = (await req.json()) as CreateTaskBody;
  return withUser(async (user) => {
    if (!body.title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    const task = await prisma.task.create({
      data: {
        userId: user.id,
        title: body.title,
        description: body.description,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        priority: body.priority ?? "medium",
      },
    });
    return NextResponse.json(task, { status: 201 });
  });
}
