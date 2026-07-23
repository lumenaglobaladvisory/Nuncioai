import { prisma } from "../lib/prisma";
import { DEMO_USER_EMAIL } from "../lib/demo";

const DEMO_MAILBOX = "stephanie@lumenaglobal-demo.com";

function daysAgo(n: number, hour = 9): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

interface SeedMessage {
  fromName?: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  bodyText: string;
  sentAt: Date;
  direction: "inbound" | "outbound";
}

interface SeedThread {
  providerThreadId: string;
  subject: string;
  snippet: string;
  messages: SeedMessage[];
}

const THREADS: SeedThread[] = [
  {
    providerThreadId: "mock-thread-contract-renewal",
    subject: "Contract renewal - need your sign-off by Friday",
    snippet: "Our legal team flagged that the renewal needs to be signed by end of day Friday...",
    messages: [
      {
        fromName: "Sarah Chen",
        fromEmail: "sarah.chen@acmecorp.com",
        toEmails: [DEMO_MAILBOX],
        subject: "Contract renewal - need your sign-off by Friday",
        bodyText:
          "Hi Stephanie,\n\nOur legal team flagged that the renewal needs to be signed by end of day Friday to avoid a lapse in coverage. Could you please review the attached redline and confirm you're good to proceed? This is urgent - let me know if you have any questions.\n\nThanks,\nSarah",
        sentAt: daysAgo(0, 8),
        direction: "inbound",
      },
    ],
  },
  {
    providerThreadId: "mock-thread-proposal-pricing",
    subject: "Consulting proposal - Brightpath Ventures",
    snippet: "Quick question - is the $15k figure inclusive of implementation support?",
    messages: [
      {
        fromEmail: DEMO_MAILBOX,
        toEmails: ["marcus@brightpathventures.com"],
        subject: "Consulting proposal - Brightpath Ventures",
        bodyText:
          "Hi Marcus,\n\nPlease find our proposal for the Q3 engagement attached. Total investment is $15,000 for the initial phase. Let me know if you have any questions.\n\nBest,\nStephanie",
        sentAt: daysAgo(6, 14),
        direction: "outbound",
      },
      {
        fromName: "Marcus Webb",
        fromEmail: "marcus@brightpathventures.com",
        toEmails: [DEMO_MAILBOX],
        subject: "Re: Consulting proposal - Brightpath Ventures",
        bodyText:
          "Hi Stephanie, thanks for sending over the proposal last week. Quick question - is the $15k figure inclusive of the implementation support, or is that billed separately? Could you clarify before we finalize budget on our end?\n\nMarcus",
        sentAt: daysAgo(0, 10),
        direction: "inbound",
      },
    ],
  },
  {
    providerThreadId: "mock-thread-partnership-followup",
    subject: "Partnership proposal for Q3",
    snippet: "Following up with the partnership proposal we discussed.",
    messages: [
      {
        fromEmail: DEMO_MAILBOX,
        toEmails: ["jordan@northwind-partners.com"],
        subject: "Partnership proposal for Q3",
        bodyText:
          "Hi Jordan,\n\nFollowing up with the partnership proposal we discussed on our call. Let me know your thoughts whenever you get a chance.\n\nBest,\nStephanie",
        sentAt: daysAgo(5, 11),
        direction: "outbound",
      },
    ],
  },
  {
    providerThreadId: "mock-thread-github-notification",
    subject: "[acme/website] New pull request opened",
    snippet: "A new pull request was opened in acme/website by contractor123.",
    messages: [
      {
        fromName: "GitHub",
        fromEmail: "notifications@github.com",
        toEmails: [DEMO_MAILBOX],
        subject: "[acme/website] New pull request opened",
        bodyText:
          "A new pull request #482 'Fix homepage layout on mobile' was opened in acme/website by contractor123. Review requested.",
        sentAt: daysAgo(1, 16),
        direction: "inbound",
      },
    ],
  },
  {
    providerThreadId: "mock-thread-newsletter",
    subject: "5 growth tactics for Q3 (Growth Weekly #142)",
    snippet: "This week: pricing experiments, cold outreach templates, and more.",
    messages: [
      {
        fromName: "Growth Weekly",
        fromEmail: "newsletter@growthweekly.com",
        toEmails: [DEMO_MAILBOX],
        subject: "5 growth tactics for Q3 (Growth Weekly #142)",
        bodyText:
          "This week: pricing experiments, cold outreach templates, and a case study on churn reduction.\n\nRead more on our site.\n\nUnsubscribe | View in browser",
        sentAt: daysAgo(2, 7),
        direction: "inbound",
      },
    ],
  },
  {
    providerThreadId: "mock-thread-brand-guidelines",
    subject: "FYI - updated brand guidelines",
    snippet: "Just sharing the updated brand guidelines doc for reference.",
    messages: [
      {
        fromName: "Priya Iyer",
        fromEmail: "priya.iyer@lumenaglobal.com",
        toEmails: [DEMO_MAILBOX],
        subject: "FYI - updated brand guidelines",
        bodyText:
          "Hey Stephanie, just sharing the updated brand guidelines doc for reference. No action needed on your end, just wanted you in the loop.",
        sentAt: daysAgo(1, 13),
        direction: "inbound",
      },
    ],
  },
  {
    providerThreadId: "mock-thread-kickoff-call",
    subject: "Kickoff call + SOW for Park Industries",
    snippet: "Could you send over the SOW draft by Wednesday?",
    messages: [
      {
        fromName: "David Park",
        fromEmail: "david@parkindustries.io",
        toEmails: [DEMO_MAILBOX],
        subject: "Kickoff call + SOW for Park Industries",
        bodyText:
          "Hi Stephanie, great chatting yesterday. Could you send over the SOW draft by Wednesday? Also, can we grab 30 minutes next week to kick off the project? Let me know what times work.\n\nDavid",
        sentAt: daysAgo(0, 9),
        direction: "inbound",
      },
    ],
  },
  {
    providerThreadId: "mock-thread-weekly-digest",
    subject: "Weekly Team Digest - Ops Updates",
    snippet: "This week across the org: new hires, office updates, and process changes.",
    messages: [
      {
        fromName: "Ops Team",
        fromEmail: "digest@lumenaglobal-internal.com",
        toEmails: [DEMO_MAILBOX],
        subject: "Weekly Team Digest - Ops Updates",
        bodyText:
          "This week across the org: we welcomed two new hires to the design team, the 4th floor office renovation is now complete, and expense reports are moving to the new portal starting next month. IT will be doing scheduled maintenance this weekend from 10pm-2am, during which VPN access may be intermittent. HR also reminds everyone that open enrollment closes at the end of the month. Finally, the annual all-hands is being scheduled for next quarter and calendar invites will go out once the venue is confirmed.",
        sentAt: daysAgo(3, 8),
        direction: "inbound",
      },
    ],
  },
];

async function main() {
  await prisma.user.delete({ where: { email: DEMO_USER_EMAIL } }).catch(() => undefined);

  const user = await prisma.user.create({
    data: {
      email: DEMO_USER_EMAIL,
      name: "Demo User",
      tonePreference: "concise, professional, friendly",
    },
  });

  const account = await prisma.connectedAccount.create({
    data: {
      userId: user.id,
      provider: "mock",
      email: DEMO_MAILBOX,
      displayName: "Stephanie (Demo)",
    },
  });

  for (const t of THREADS) {
    const lastMessage = t.messages[t.messages.length - 1];
    const participants = Array.from(
      new Set(t.messages.flatMap((m) => [m.fromEmail, ...m.toEmails]))
    ).map((email) => ({ email }));

    const thread = await prisma.emailThread.create({
      data: {
        connectedAccountId: account.id,
        providerThreadId: t.providerThreadId,
        subject: t.subject,
        participants: JSON.stringify(participants),
        snippet: t.snippet,
        lastMessageAt: lastMessage.sentAt,
      },
    });

    await prisma.emailMessage.createMany({
      data: t.messages.map((m, i) => ({
        threadId: thread.id,
        providerMessageId: `${t.providerThreadId}-msg-${i}`,
        fromName: m.fromName,
        fromEmail: m.fromEmail,
        toEmails: JSON.stringify(m.toEmails),
        subject: m.subject,
        bodyText: m.bodyText,
        sentAt: m.sentAt,
        direction: m.direction,
      })),
    });
  }

  console.log(`Seeded demo user (${DEMO_USER_EMAIL}) with ${THREADS.length} threads on mailbox ${DEMO_MAILBOX}.`);
  console.log(`Sign in with "Continue as Demo Account" on the login page, then click "Sync inbox" to triage them.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
