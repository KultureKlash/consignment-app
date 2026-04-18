import type { ActionFunctionArgs, LinksFunction } from "react-router";
import { redirect } from "react-router";
import { createSessionCookie } from "~/services/portal/auth.server";
import { LoginPage } from "~/components/portal/auth/LoginPage";
import portalStyles from "~/portal.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: portalStyles },
];

// ── Action ──────────────────────────────────────────────

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
      const parsed = parseForm(verifyOtpSchema, form);

      const { verifyOtp } = await import("~/services/otp.server");
      const result = await verifyOtp(parsed.email, parsed.code);

      if ("error" in result) return { error: result.error, email: parsed.email };

      throw redirect("/portal/dashboard", {
        headers: { "Set-Cookie": createSessionCookie(result.consignor.id) },
      });
    }

    return { error: "Invalid request" };
  } catch (err) {
    if (err instanceof Response) throw err;
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

// ── Component ───────────────────────────────────────────

export default function PortalLogin() {
  return <LoginPage />;
}
