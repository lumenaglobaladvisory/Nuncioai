import { auth } from "@/auth";
import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <NavBar userLabel={session.user.name ?? session.user.email ?? "Account"} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
