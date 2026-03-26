import { useState, useEffect, useRef } from "react";
import { Form, useActionData, useNavigation, redirect } from "react-router";
import type { ActionFunctionArgs, LinksFunction } from "react-router";
import { Loader2, ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { createSessionCookie } from "~/services/portal-auth.server";
import portalStyles from "~/portal.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: portalStyles },
];

// ── Action ──────────────────────────────────────────────

type ActionData =
  | { step: "verify"; email: string; error?: never }
  | { error: string; step?: never; email?: string };

export async function action({ request }: ActionFunctionArgs) {
  const { loginRateLimit } = await import("~/lib/rate-limit.server");
  const limited = loginRateLimit(request);
  if (limited) return { error: "Too many attempts. Please try again in a few minutes." };

  const form = await request.formData();
  const intent = form.get("intent") as string;

  try {
    if (intent === "request-otp") {
      const { requestOtpSchema, parseForm } = await import("~/lib/validation");
      const data = parseForm(requestOtpSchema, form);

      const { requestOtp } = await import("~/services/otp.server");
      const result = await requestOtp(data.email);

      if (result.error) return { error: result.error };
      return { step: "verify" as const, email: data.email };
    }

    if (intent === "verify-otp") {
      const { verifyOtpSchema, parseForm } = await import("~/lib/validation");
      const data = parseForm(verifyOtpSchema, form);

      const { verifyOtp } = await import("~/services/otp.server");
      const result = await verifyOtp(data.email, data.code);

      if ("error" in result) return { error: result.error, email: data.email };

      throw redirect("/portal/dashboard", {
        headers: { "Set-Cookie": createSessionCookie(result.consignor.id) },
      });
    }

    return { error: "Invalid request" };
  } catch (err) {
    if (err instanceof Response) throw err; // redirect
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

// ── Component ───────────────────────────────────────────

export default function PortalLogin() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "verify">("email");
  const codeRef = useRef<HTMLInputElement>(null);

  // Sync step from server response
  useEffect(() => {
    if (actionData?.step === "verify") {
      setStep("verify");
      setCode("");
      setTimeout(() => codeRef.current?.focus(), 100);
    }
    if (actionData?.email) {
      setEmail(actionData.email);
    }
  }, [actionData]);

  const handleBack = () => {
    setStep("email");
    setCode("");
  };

  // Mask email: j***@example.com
  const maskedEmail = email
    ? email.replace(/^(.)(.*)(@.*)$/, (_, first, middle, domain) =>
        first + "•".repeat(Math.min(middle.length, 4)) + domain
      )
    : "";

  return (
    <div className="portal-root relative min-h-screen flex items-center justify-center p-4">
      {/* BG */}
      <div
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/sneakers.jpg)" }}
      />
      <div className="fixed inset-0 backdrop-blur-md" style={{ background: "rgba(0, 0, 0, 0.92)" }} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="glass-panel-strong rounded-3xl p-8 glow-border animate-slide-up">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-[rgba(255,255,255,0.1)] flex items-center justify-center glow-border mb-4">
              <span className="text-2xl font-extrabold text-primary tracking-tighter">K</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Konsign</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {step === "email" ? "Sign in to your consignor portal" : "Enter your verification code"}
            </p>
          </div>

          {/* Error */}
          {actionData?.error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium bg-[hsl(0_62%_55%/0.15)] text-destructive animate-fade-in">
              {actionData.error}
            </div>
          )}

          {/* Step 1: Email */}
          {step === "email" && (
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="request-otp" />
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-glow w-full py-3 text-center flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Send login code
                  </>
                )}
              </button>
            </Form>
          )}

          {/* Step 2: OTP verification */}
          {step === "verify" && (
            <Form method="post" reloadDocument className="space-y-4">
              <input type="hidden" name="intent" value="verify-otp" />
              <input type="hidden" name="email" value={email} />

              {/* Code sent notice */}
              <div className="px-4 py-3 rounded-xl text-sm bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
                <span className="text-muted-foreground">
                  Code sent to{" "}
                  <span className="text-foreground font-medium">{maskedEmail}</span>
                </span>
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">6-digit code</label>
                <input
                  ref={codeRef}
                  type="text"
                  name="code"
                  value={code}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(v);
                  }}
                  placeholder="000000"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm text-center tracking-[0.3em] font-mono text-lg"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || code.length !== 6}
                className="btn-glow w-full py-3 text-center flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Verify & sign in
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleBack}
                className="w-full py-2 text-center text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Use a different email
              </button>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
