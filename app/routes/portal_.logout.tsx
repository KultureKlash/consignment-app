import { redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { destroySessionCookie } from "~/services/portal/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  return redirect("/portal/login", {
    headers: { "Set-Cookie": destroySessionCookie() },
  });
}

export function loader() {
  return redirect("/portal/login");
}
