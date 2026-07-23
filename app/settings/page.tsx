import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SettingsClient from "@/components/SettingsClient";

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
        <h1 className="text-xl font-semibold text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Connected mailboxes, tone preferences, and per-recipient memory.</p>
      </div>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
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
              <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50">
                Connect Google
              </button>
            </form>
          )}
          {microsoftEnabled && (
            <form action={async () => { "use server"; await signIn("microsoft-entra-id", { redirectTo: "/settings" }); }}>
              <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50">
                Connect Microsoft
              </button>
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
