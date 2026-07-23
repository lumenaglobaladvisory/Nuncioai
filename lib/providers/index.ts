import type { ConnectedAccount } from "@prisma/client";
import type { CalendarProvider, EmailProvider } from "./types";
import { MockEmailProvider, MockCalendarProvider } from "./mock";
import { GmailProvider, GoogleCalendarProvider } from "./gmail";
import { OutlookProvider, OutlookCalendarProvider } from "./outlook";

export function getEmailProvider(account: ConnectedAccount): EmailProvider {
  switch (account.provider) {
    case "google":
      if (!account.accessToken) throw new Error(`ConnectedAccount ${account.id} is missing an access token`);
      return new GmailProvider({ accessToken: account.accessToken, refreshToken: account.refreshToken }, account.email);
    case "microsoft":
      if (!account.accessToken) throw new Error(`ConnectedAccount ${account.id} is missing an access token`);
      return new OutlookProvider({ accessToken: account.accessToken }, account.email);
    case "mock":
    default:
      return new MockEmailProvider(account.id);
  }
}

export function getCalendarProvider(account: ConnectedAccount): CalendarProvider {
  switch (account.provider) {
    case "google":
      if (!account.accessToken) throw new Error(`ConnectedAccount ${account.id} is missing an access token`);
      return new GoogleCalendarProvider({ accessToken: account.accessToken, refreshToken: account.refreshToken });
    case "microsoft":
      if (!account.accessToken) throw new Error(`ConnectedAccount ${account.id} is missing an access token`);
      return new OutlookCalendarProvider({ accessToken: account.accessToken });
    case "mock":
    default:
      return new MockCalendarProvider();
  }
}

export * from "./types";
