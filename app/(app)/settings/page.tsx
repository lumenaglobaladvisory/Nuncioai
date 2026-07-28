import Link from "next/link";
import { Sparkles } from "lucide-react";
import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SettingsClient from "@/components/SettingsClient";
import Button from "@/components/Button";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, connectedAccounts, memories] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    prisma.connectedAccount.findMany({ where: { userId: session.user.id } }),
    prisma.memoryEntry.findMany({ where: { userId: session.user.id }, orderBy: { updatedAt: "desc" } }),
  ]);

  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  const microsoftEnabled = Boolean(process.env.MICROSOFT_CLIENT_ID);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Connected mailboxes, tone preferences, and per-recipient memory.</p>
      </div>

      <section className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-100">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Sparkles className="h-4.5 w-4.5" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-900">Personalization</p>
            <p className="text-xs text-neutral-500">Re-learn your tone and re-pick recommended policies.</p>
          </div>
        </div>
        <Link href="/onboarding">
          <Button variant="secondary" size="sm">
            Redo personalization
          </Button>
        </Link>
      </section>

      <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-100">
        <h2 className="text-sm font-semibold text-neutral-700">Connected mailboxes</h2>
        <ul className="divide-y divide-neutral-200">
          {connectedAccounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {a.email} <span className="text-neutral-400">({a.provider})</span>
              </span>
            </li>
          ))}
          {connectedAccounts.length === 0 && <li className="py-2 text-sm text-neutral-400">No mailboxes connected yet.</li>}
        </ul>
        <div className="flex gap-2 pt-1">
          {googleEnabled && (
            <form action={async () => { "use server"; await signIn("google", { redirectTo: "/settings" }); }}>
              <Button type="submit" variant="secondary" size="sm">
                Connect Google
              </Button>
            </form>
          )}
          {microsoftEnabled && (
            <form action={async () => { "use server"; await signIn("microsoft-entra-id", { redirectTo: "/settings" }); }}>
              <Button type="submit" variant="secondary" size="sm">
                Connect Microsoft
              </Button>
            </form>
          )}
          {!googleEnabled && !microsoftEnabled && (
            <p className="text-xs text-neutral-400">
              Google/Microsoft OAuth aren&apos;t configured in this environment (see .env.example).
            </p>
          )}
        </div>
      </section>

      <SettingsClient user={user} memories={memories} />
    </div>
  );
}
