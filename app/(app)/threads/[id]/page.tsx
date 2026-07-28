import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ThreadDetailClient from "@/components/ThreadDetailClient";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const thread = await prisma.emailThread.findFirst({
    where: { id, connectedAccount: { userId: session.user.id } },
    include: {
      messages: { orderBy: { sentAt: "asc" } },
      drafts: { orderBy: { createdAt: "desc" } },
      connectedAccount: { select: { provider: true, email: true } },
    },
  });
  if (!thread) notFound();

  const plans = await prisma.plan.findMany({
    where: { userId: session.user.id, actions: { some: { threadId: id } } },
    include: { actions: { include: { thread: { select: { subject: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return <ThreadDetailClient thread={thread} plans={plans} />;
}
