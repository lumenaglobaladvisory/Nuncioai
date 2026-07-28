import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { getLLMService } from "@/lib/llm";

// Samples the user's own outbound mail to infer a tone description. Does
// NOT persist anything - the wizard shows this as an editable suggestion,
// and persistence happens at /api/onboarding/complete so backing out of
// the flow never half-saves.
export async function POST() {
  return withUser(async (user) => {
    const samples = await prisma.emailMessage.findMany({
      where: { direction: "outbound", thread: { connectedAccount: { userId: user.id } } },
      orderBy: { sentAt: "desc" },
      take: 20,
      select: { subject: true, bodyText: true },
    });

    const tone = await getLLMService().inferTone(samples);
    return NextResponse.json({ ...tone, sampleSize: samples.length });
  });
}
