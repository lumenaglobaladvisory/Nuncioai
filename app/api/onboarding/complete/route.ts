import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { createPolicyFromTemplate, getPolicyTemplate } from "@/lib/policy-templates";

interface CompleteBody {
  tonePreference?: string;
  followupTone?: string;
  selectedTemplateKeys?: string[];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CompleteBody;
  return withUser(async (user) => {
    for (const key of body.selectedTemplateKeys ?? []) {
      if (!getPolicyTemplate(key)) {
        return NextResponse.json({ error: `Unknown policy template: ${key}` }, { status: 400 });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        tonePreference: body.tonePreference ?? undefined,
        onboardedAt: new Date(),
      },
    });

    const policies = [];
    for (const key of body.selectedTemplateKeys ?? []) {
      // Only the follow-up-type template has a meaningful tone; others ignore the override.
      const toneOverride = key === "proposal-followup" ? body.followupTone : undefined;
      policies.push(await createPolicyFromTemplate(user.id, key, toneOverride));
    }

    return NextResponse.json({ policies });
  });
}
