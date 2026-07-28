"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, LayoutDashboard, Workflow, CheckSquare, Settings } from "lucide-react";
import { signOutAction } from "@/lib/actions";
import Avatar from "./Avatar";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/policies", label: "Policies", icon: Workflow },
  { href: "/tasks", label: "Tasks & Calendar", icon: CheckSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function NavBar({ userLabel }: { userLabel: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200/80 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Mail className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="text-sm font-semibold tracking-tight text-neutral-900">InboxPilot</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-indigo-50 text-indigo-700" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Avatar name={userLabel} size="sm" />
          <span className="hidden text-sm text-neutral-600 sm:inline">{userLabel}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
