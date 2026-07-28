import { Mail } from "lucide-react";
import { signIn } from "@/auth";
import Button from "@/components/Button";

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  const microsoftEnabled = Boolean(process.env.MICROSOFT_CLIENT_ID);

  return (
    <div
      className="flex min-h-full flex-1 items-center justify-center px-4"
      style={{ background: "radial-gradient(circle at 50% 0%, #eef2ff 0%, #fafafa 55%)" }}
    >
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg shadow-neutral-200/50">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Mail className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-neutral-900">InboxPilot</h1>
            <p className="text-sm text-neutral-500">Reduce inbox time. Move real work forward.</p>
          </div>
        </div>

        <div className="space-y-2">
          {googleEnabled && (
            <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
              <Button type="submit" variant="secondary" className="w-full">
                Continue with Google
              </Button>
            </form>
          )}
          {microsoftEnabled && (
            <form action={async () => { "use server"; await signIn("microsoft-entra-id", { redirectTo: "/" }); }}>
              <Button type="submit" variant="secondary" className="w-full">
                Continue with Microsoft
              </Button>
            </form>
          )}
          {!googleEnabled && !microsoftEnabled && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Google/Microsoft OAuth aren&apos;t configured in this environment (see .env.example). Use the demo
              account below to explore the full app with sample data.
            </p>
          )}
          <form action={async () => { "use server"; await signIn("demo", { redirectTo: "/" }); }}>
            <Button type="submit" variant="primary" className="w-full">
              Continue as Demo Account
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
