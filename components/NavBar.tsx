import Link from "next/link";
import { signOut } from "@/auth";

export default function NavBar({ userLabel }: { userLabel: string }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-900">
            InboxPilot
          </Link>
          <nav className="flex items-center gap-4 text-sm text-neutral-600">
            <Link href="/" className="hover:text-neutral-900">
              Dashboard
            </Link>
            <Link href="/policies" className="hover:text-neutral-900">
              Policies
            </Link>
            <Link href="/tasks" className="hover:text-neutral-900">
              Tasks &amp; Calendar
            </Link>
            <Link href="/settings" className="hover:text-neutral-900">
              Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <span>{userLabel}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
