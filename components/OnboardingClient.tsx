"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Wand2, SlidersHorizontal, Sparkles, ArrowRight, Repeat, Archive, CalendarClock } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import Button from "./Button";
import { POLICY_TEMPLATES, type PolicyTemplate } from "@/lib/policy-templates";

const STEPS = ["Welcome", "Your tone", "Preferences", "Recommended"] as const;

const FIRMNESS_OPTIONS = [
  { value: "gentle", label: "Gentle", description: "Soft nudges, easy to ignore." },
  { value: "polite_firm", label: "Balanced", description: "Polite but clear you want a reply." },
  { value: "firm", label: "Firm", description: "Direct, makes the ask hard to miss." },
] as const;

const CATEGORY_ICON: Record<PolicyTemplate["category"], typeof Repeat> = {
  followup: Repeat,
  cleanup: Archive,
  reminders: CalendarClock,
};

interface ToneResponse {
  summary: string;
  sampleSize: number;
}

export default function OnboardingClient({ initialTonePreference }: { initialTonePreference: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [tone, setTone] = useState(initialTonePreference ?? "");
  const [sampleSize, setSampleSize] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [firmness, setFirmness] = useState<(typeof FIRMNESS_OPTIONS)[number]["value"]>("polite_firm");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(POLICY_TEMPLATES.map((t) => t.key)));

  const [finishing, setFinishing] = useState(false);

  async function analyzeTone() {
    setAnalyzing(true);
    setError(null);
    try {
      await apiFetch("/api/sync", { method: "POST" }).catch(() => undefined);
      const result = await apiFetch<ToneResponse>("/api/onboarding/tone", { method: "POST" });
      setTone(result.summary);
      setSampleSize(result.sampleSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyze your inbox");
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function finish(selectedOverride?: Set<string>) {
    setFinishing(true);
    setError(null);
    try {
      await apiFetch("/api/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({
          tonePreference: tone || undefined,
          followupTone: firmness,
          selectedTemplateKeys: Array.from(selectedOverride ?? selectedKeys),
        }),
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setFinishing(false);
    }
  }

  const skip = () => finish(new Set());

  return (
    <div
      className="flex min-h-full flex-1 items-center justify-center px-4 py-10"
      style={{ background: "radial-gradient(circle at 50% 0%, #eef2ff 0%, #fafafa 55%)" }}
    >
      <div className="w-full max-w-lg space-y-5">
        <div className="flex items-center justify-center gap-1.5">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-8 bg-indigo-600" : i < step ? "w-4 bg-indigo-300" : "w-4 bg-neutral-200"
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg shadow-neutral-200/50">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          {step === 0 && (
            <div className="space-y-5 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                <Mail className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <div className="space-y-1.5">
                <h1 className="text-lg font-semibold text-neutral-900">Let&apos;s personalize InboxPilot</h1>
                <p className="text-sm text-neutral-500">
                  Under a minute: we&apos;ll learn how you write, ask a couple of quick preferences, and set up the
                  automations that fit how you already work.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => setStep(1)}>
                  Get started
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                </Button>
                <Button variant="ghost" onClick={skip} disabled={finishing}>
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Wand2 className="h-4.5 w-4.5" strokeWidth={2} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900">Learn your tone</h2>
                  <p className="text-xs text-neutral-500">
                    We&apos;ll skim your own sent mail to describe how you write - never sent anywhere, just used to
                    match your drafts.
                  </p>
                </div>
              </div>

              <Button variant="secondary" onClick={analyzeTone} disabled={analyzing} className="w-full">
                <Sparkles className={`h-3.5 w-3.5 ${analyzing ? "animate-pulse" : ""}`} strokeWidth={2.25} />
                {analyzing ? "Reading your sent mail..." : "Analyze my sent mail"}
              </Button>

              {sampleSize !== null && (
                <p className="text-xs text-neutral-400">
                  {sampleSize > 0
                    ? `Based on your last ${sampleSize} sent message${sampleSize === 1 ? "" : "s"}.`
                    : "No sent mail found yet - using a sensible default. Edit it below, or sync your inbox first."}
                </p>
              )}

              <div>
                <label className="text-xs font-medium text-neutral-500">Your tone (edit freely)</label>
                <textarea
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  rows={3}
                  placeholder="concise, professional, friendly"
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button onClick={() => setStep(2)}>
                  Continue
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <SlidersHorizontal className="h-4.5 w-4.5" strokeWidth={2} />
                </span>
                <h2 className="text-sm font-semibold text-neutral-900">A couple of preferences</h2>
              </div>

              <div>
                <p className="text-xs font-medium text-neutral-500">How firm should follow-ups be?</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {FIRMNESS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFirmness(opt.value)}
                      className={`rounded-lg border p-2.5 text-left transition-colors ${
                        firmness === opt.value
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      <p className="text-xs font-medium text-neutral-900">{opt.label}</p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">{opt.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-neutral-500">What should InboxPilot handle automatically?</p>
                <div className="mt-2 space-y-1.5">
                  {POLICY_TEMPLATES.map((template) => {
                    const Icon = CATEGORY_ICON[template.category];
                    return (
                      <label
                        key={template.key}
                        className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-neutral-200 p-2.5 hover:bg-neutral-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(template.key)}
                          onChange={() => toggleKey(template.key)}
                          className="mt-0.5 h-3.5 w-3.5"
                        />
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2} />
                        <div>
                          <p className="text-xs font-medium text-neutral-900">{template.title}</p>
                          <p className="text-[11px] text-neutral-500">{template.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)}>
                  Continue
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Sparkles className="h-4.5 w-4.5" strokeWidth={2} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900">Ready to go</h2>
                  <p className="text-xs text-neutral-500">
                    {selectedKeys.size === 0
                      ? "No policies selected - you can always add them later from Policies."
                      : `Enabling ${selectedKeys.size} polic${selectedKeys.size === 1 ? "y" : "ies"}, tuned to your tone.`}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {POLICY_TEMPLATES.filter((t) => selectedKeys.has(t.key)).map((template) => {
                  const Icon = CATEGORY_ICON[template.category];
                  return (
                    <div key={template.key} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div>
                        <p className="text-xs font-medium text-neutral-900">{template.title}</p>
                        <p className="text-[11px] text-neutral-500">
                          {template.description}
                          {template.key === "proposal-followup" &&
                            ` Tone: ${FIRMNESS_OPTIONS.find((f) => f.value === firmness)?.label.toLowerCase()}.`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button onClick={() => finish()} disabled={finishing}>
                  {finishing ? "Setting up..." : "Enable & finish"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
