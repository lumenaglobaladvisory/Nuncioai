import { prisma } from "@/lib/prisma";

export interface PolicyTemplate {
  key: string;
  title: string;
  description: string;
  category: "followup" | "cleanup" | "reminders";
  config: {
    triggerType: string;
    timeDelay?: string;
    scope?: string;
    action: string;
    tone?: string;
  };
}

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    key: "proposal-followup",
    title: "Follow up on proposals",
    description: 'Draft a polite check-in when someone hasn\'t replied to your last message in 3 days.',
    category: "followup",
    config: { triggerType: "no_reply", timeDelay: "3d", action: "draft_followup", tone: "polite_firm" },
  },
  {
    key: "noise-cleanup",
    title: "Clear out noise",
    description: "Summarize and archive newsletters, notifications, and other automated mail every week.",
    category: "cleanup",
    config: { triggerType: "schedule", timeDelay: "7d", scope: "category:noise", action: "summarize_and_archive" },
  },
  {
    key: "meeting-prep",
    title: "Meeting prep reminders",
    description: "Create a prep task the day before any upcoming meeting on your calendar.",
    category: "reminders",
    config: { triggerType: "before_meeting", timeDelay: "1d", action: "send_reminder" },
  },
];

export function getPolicyTemplate(key: string): PolicyTemplate | undefined {
  return POLICY_TEMPLATES.find((t) => t.key === key);
}

/** Idempotent: returns the existing policy if this template was already added for the user. */
export async function createPolicyFromTemplate(userId: string, templateKey: string, toneOverride?: string) {
  const template = getPolicyTemplate(templateKey);
  if (!template) throw new Error(`Unknown policy template: ${templateKey}`);

  const existing = await prisma.policy.findFirst({ where: { userId, templateKey } });
  if (existing) return existing;

  return prisma.policy.create({
    data: {
      userId,
      name: template.title,
      triggerType: template.config.triggerType,
      timeDelay: template.config.timeDelay,
      scope: template.config.scope,
      action: template.config.action,
      tone: toneOverride ?? template.config.tone,
      templateKey: template.key,
    },
  });
}
