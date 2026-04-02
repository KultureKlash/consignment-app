import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { verifyImpersonationToken, createSessionCookie } from "~/services/portal/auth.server";

/**
 * Admin impersonation endpoint.
 * GET /portal/impersonate?token=xxx → sets portal session cookie → redirects to portal.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) throw new Response("Missing token", { status: 400 });

  const consignorId = verifyImpersonationToken(token);
  if (!consignorId) throw new Response("Invalid or expired token", { status: 403 });

  return redirect("/portal/dashboard", {
    headers: { "Set-Cookie": createSessionCookie(consignorId) },
  });
};
