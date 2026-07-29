import { prisma } from "@/lib/prisma";

const LOOKBACK_DAYS = 21;

/**
 * Lowercased addresses the user has personally sent mail to recently, across
 * ANY thread - not just the one being classified. Automated reminder/
 * compliance systems (government portals, vendor trackers, etc.) commonly
 * send each follow-up as a brand-new thread rather than a reply, so a
 * request the user already handled can still look "unanswered" when judged
 * thread-by-thread. If they've replied to this sender recently at all,
 * that's a strong signal any other outstanding thread from the same sender
 * is stale too, not a fresh ask.
 */
export async function getRecentlyRepliedToSenders(userId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const outbound = await prisma.emailMessage.findMany({
    where: {
      direction: "outbound",
      sentAt: { gte: since },
      thread: { connectedAccount: { userId } },
    },
    select: { toEmails: true, ccEmails: true },
  });

  const senders = new Set<string>();
  for (const m of outbound) {
    for (const email of JSON.parse(m.toEmails) as string[]) senders.add(email.toLowerCase());
    if (m.ccEmails) {
      for (const email of JSON.parse(m.ccEmails) as string[]) senders.add(email.toLowerCase());
    }
  }
  return senders;
}

export function threadSenderRecentlyRepliedTo(senderEmail: string, recentlyRepliedTo: Set<string>): boolean {
  return recentlyRepliedTo.has(senderEmail.toLowerCase());
}
