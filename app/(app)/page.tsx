import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTodayList } from "@/lib/triage";
import { getWeeklyDigest, getWeeklyImpact } from "@/lib/stats";
import { isStubMode } from "@/lib/llm";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!user.onboardedAt) redirect("/onboarding");

  const [today, pendingPlans, accounts, impact, digest] = await Promise.all([
    getTodayList(session.user.id),
    prisma.plan.findMany({
      where: { userId: session.user.id, status: { in: ["pending", "approved"] } },
      include: { actions: { include: { thread: { select: { subject: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.connectedAccount.findMany({ where: { userId: session.user.id } }),
    getWeeklyImpact(session.user.id),
    getWeeklyDigest(session.user.id),
  ]);

  return (
    <DashboardClient
      initialToday={today.map(({ thread, reason }) => ({ ...thread, reason }))}
      pendingPlans={pendingPlans}
      accountsCount={accounts.length}
      llmMode={isStubMode() ? "stub" : "claude"}
      impact={impact}
      digest={digest}
    />
  );
}
