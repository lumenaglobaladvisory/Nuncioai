import { signIn } from "@/auth";

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  const microsoftEnabled = Boolean(process.env.MICROSOFT_CLIENT_ID);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold text-neutral-900">InboxPilot</h1>
          <p className="text-sm text-neutral-500">Reduce inbox time. Move real work forward.</p>
        </div>

        <div className="space-y-2">
          {googleEnabled && (
            <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
              <button
                type="submit"
                className="w-full rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Continue with Google
              </button>
            </form>
          )}
          {microsoftEnabled && (
            <form action={async () => { "use server"; await signIn("microsoft-entra-id", { redirectTo: "/" }); }}>
              <button
                type="submit"
                className="w-full rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Continue with Microsoft
              </button>
            </form>
          )}
          {!googleEnabled && !microsoftEnabled && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Google/Microsoft OAuth aren&apos;t configured in this environment (see .env.example). Use the demo
              account below to explore the full app with sample data.
            </p>
          )}
          <form action={async () => { "use server"; await signIn("demo", { redirectTo: "/" }); }}>
            <button
              type="submit"
              className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Continue as Demo Account
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
