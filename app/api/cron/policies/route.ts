import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateAllPolicies } from "@/lib/policies";

// Intended to be hit by an external scheduler (Vercel Cron, GitHub Actions,
// etc.) on an interval. Protected by a shared secret rather than a user
// session since there's no browser session in a cron context.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIds = await prisma.policy.findMany({
    where: { enabled: true },
    distinct: ["userId"],
    select: { userId: true },
  });

  const results = [];
  for (const { userId } of userIds) {
    results.push({ userId, runs: await evaluateAllPolicies(userId) });
  }
  return NextResponse.json({ usersProcessed: userIds.length, results });
}
