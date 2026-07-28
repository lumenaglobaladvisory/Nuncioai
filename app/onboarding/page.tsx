import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import OnboardingClient from "@/components/OnboardingClient";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  return <OnboardingClient initialTonePreference={user.tonePreference} />;
}
