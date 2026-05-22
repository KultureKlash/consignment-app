import { useState, useEffect, useRef } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import { Loader2, ArrowLeft, Mail, ShieldCheck } from "lucide-react";

type ActionData =
  | { step: "verify"; email: string; error?: never }
  | { error: string; step?: never; email?: string };

export function LoginPage() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Initialize directly from action data so SSR renders the right step
  // immediately (no JS-hydration dependency for the email → verify transition)
  const [email, setEmail] = useState(actionData?.email ?? "");
  const [step, setStep] = useState<"email" | "verify">(
    actionData?.step === "verify" ? "verify" : "email"
  );
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (actionData?.step === "verify") setStep("verify");
    if (actionData?.email) setEmail(actionData.email);
  }, [actionData]);

  useEffect(() => {
    if (step === "verify") {
      if (codeRef.current) codeRef.current.value = "";
      setTimeout(() => codeRef.current?.focus(), 100);
    }
  }, [step]);

  const handleBack = () => {
    setStep("email");
  };

  // Mask email: j***@example.com
  const maskedEmail = email
    ? email.replace(/^(.)(.*)(@.*)$/, (_, first, middle, domain) =>
        first + "\u2022".repeat(Math.min(middle.length, 4)) + domain
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
              <input type="hidden" name="email" value={email || actionData?.email || ""} />

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
                  placeholder="000000"
                  required
                  maxLength={6}
                  pattern="\d{6}"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm text-center tracking-[0.3em] font-mono text-lg"
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

      {/* Kulture Klash logo */}
      <div className="fixed bottom-4 right-4 z-10 opacity-60 hover:opacity-100 transition-opacity">
        <img src="/kulture%20logo.png" alt="Kulture Klash" className="h-20" />
      </div>
    </div>
  );
}
