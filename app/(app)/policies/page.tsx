import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PoliciesClient from "@/components/PoliciesClient";

export default async function PoliciesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const policies = await prisma.policy.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return <PoliciesClient initialPolicies={policies} />;
}
