import type { ConnectedAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCalendarProvider } from "@/lib/providers";

const SYNC_WINDOW_PAST_DAYS = 30;
const SYNC_WINDOW_FUTURE_DAYS = 60;

/** Pulls real calendar events into the local CalendarEvent table (status "created") so the rest of the app - the Tasks & Calendar page, the before_meeting policy, and triage staleness checks below - can read real calendar data instead of only events InboxPilot itself created. */
export async function syncCalendarForAccount(account: ConnectedAccount): Promise<void> {
  const provider = getCalendarProvider(account);
  const timeMin = new Date(Date.now() - SYNC_WINDOW_PAST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + SYNC_WINDOW_FUTURE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const events = await provider.listEvents({ timeMin, timeMax });

  for (const e of events) {
    const data = {
      title: e.title,
      description: e.description ?? null,
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime),
      location: e.location ?? null,
      attendees: e.attendees ? JSON.stringify(e.attendees) : null,
      status: "created" as const,
    };
    const existing = await prisma.calendarEvent.findFirst({
      where: { userId: account.userId, providerEventId: e.providerEventId },
    });
    if (existing) {
      await prisma.calendarEvent.update({ where: { id: existing.id }, data });
    } else {
      await prisma.calendarEvent.create({ data: { ...data, userId: account.userId, providerEventId: e.providerEventId } });
    }
  }
}

/** Lowercased emails that attended some real, already-ended calendar event for this user. One query, reused across every thread in a sync pass instead of a per-thread lookup. */
export async function getPastMeetingAttendees(userId: string): Promise<Set<string>> {
  const pastEvents = await prisma.calendarEvent.findMany({
    where: { userId, status: "created", endTime: { lt: new Date() } },
    select: { attendees: true },
  });
  const attendees = new Set<string>();
  for (const event of pastEvents) {
    if (!event.attendees) continue;
    const parsed: string[] = JSON.parse(event.attendees);
    for (const email of parsed) attendees.add(email.toLowerCase());
  }
  return attendees;
}

/** True if any of this thread's participants attended a real meeting that's already over - a signal a "must respond today" classification tied to that meeting is stale, not current. */
export function threadHasStaleMeetingContext(participantEmails: string[], pastAttendees: Set<string>): boolean {
  return participantEmails.some((email) => pastAttendees.has(email.toLowerCase()));
}
