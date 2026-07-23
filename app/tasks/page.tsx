import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TasksClient from "@/components/TasksClient";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [tasks, events] = await Promise.all([
    prisma.task.findMany({
      where: { userId: session.user.id },
      include: { thread: { select: { subject: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.calendarEvent.findMany({
      where: { userId: session.user.id },
      include: { thread: { select: { subject: true } } },
      orderBy: { startTime: "asc" },
    }),
  ]);

  return <TasksClient initialTasks={tasks} initialEvents={events} />;
}
