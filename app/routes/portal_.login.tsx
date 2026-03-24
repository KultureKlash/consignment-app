import { useState } from "react";
import { Form, useActionData, useNavigation, redirect } from "react-router";
import type { ActionFunctionArgs, LinksFunction } from "react-router";
import { Loader2 } from "lucide-react";
import { loginPortal, createSessionCookie } from "~/services/portal-auth.server";
import portalStyles from "~/portal.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: portalStyles },
];

// ── Action ──────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  const result = await loginPortal(email, password);
  if ("error" in result) return { error: result.error };

  throw redirect("/portal", {
    headers: {
      "Set-Cookie": createSessionCookie(result.consignor.id),
    },
  });
}

// ── Component ───────────────────────────────────────────

export default function PortalLogin() {
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
            <p className="text-sm text-muted-foreground mt-1">Sign in to your consignor portal</p>
          </div>

          {/* Error */}
          {actionData?.error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium bg-[hsl(0_62%_55%/0.15)] text-destructive animate-fade-in">
              {actionData.error}
            </div>
          )}

          <Form method="post" reloadDocument className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Password</label>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
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
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </Form>

          {/* Dev hint */}
          <div className="mt-6 px-4 py-3 rounded-xl text-xs text-muted-foreground bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
            <span className="font-semibold text-primary">Dev mode</span>
            {" — Use any consignor email with password "}
            <code className="px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.08)] text-foreground font-mono text-[11px] font-semibold">
              konsign
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
