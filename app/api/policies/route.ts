import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";

const TRIGGER_TYPES = ["no_reply", "before_meeting", "schedule", "label_added"];
const ACTIONS = ["draft_followup", "summarize_and_archive", "send_reminder"];

export async function GET() {
  return withUser(async (user) => {
    const policies = await prisma.policy.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json(policies);
  });
}

interface CreatePolicyBody {
  name: string;
  triggerType: string;
  timeDelay?: string;
  scope?: string;
  action: string;
  tone?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as CreatePolicyBody;
  return withUser(async (user) => {
    if (!body.name || !TRIGGER_TYPES.includes(body.triggerType) || !ACTIONS.includes(body.action)) {
      return NextResponse.json(
        { error: `name is required; triggerType must be one of ${TRIGGER_TYPES.join(", ")}; action must be one of ${ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }
    const policy = await prisma.policy.create({
      data: {
        userId: user.id,
        name: body.name,
        triggerType: body.triggerType,
        timeDelay: body.timeDelay,
        scope: body.scope,
        action: body.action,
        tone: body.tone,
      },
    });
    return NextResponse.json(policy, { status: 201 });
  });
}
