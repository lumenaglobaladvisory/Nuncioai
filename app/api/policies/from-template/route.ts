import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-utils";
import { createPolicyFromTemplate, getPolicyTemplate } from "@/lib/policy-templates";

interface FromTemplateBody {
  templateKey: string;
  tone?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as FromTemplateBody;
  return withUser(async (user) => {
    if (!body.templateKey || !getPolicyTemplate(body.templateKey)) {
      return NextResponse.json({ error: "Unknown policy template" }, { status: 400 });
    }
    const policy = await createPolicyFromTemplate(user.id, body.templateKey, body.tone);
    return NextResponse.json(policy, { status: 201 });
  });
}
