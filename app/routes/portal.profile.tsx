import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData, redirect } from "react-router";
import { authenticatePortal } from "~/services/portal/auth.server";
import { ProfilePage } from "~/components/portal/profile/ProfilePage";
import type { loader as portalLoader } from "./portal";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  return {
    consignor: {
      id: consignor.id,
      name: consignor.name,
      email: consignor.email,
      phone: consignor.phone,
      taxStatus: consignor.taxStatus,
      province: consignor.province,
      gstNumber: consignor.gstNumber,
      qstNumber: consignor.qstNumber,
      feeRate: consignor.feeRate,
      avatarColor: consignor.avatarColor,
      notificationPrefs: consignor.notificationPrefs,
      createdAt: consignor.createdAt,
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { portalFormRateLimit } = await import("~/lib/rate-limit.server");
  const limited = portalFormRateLimit(request);
  if (limited) return limited;

  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "update-profile") {
    const { updateProfileSchema, parseForm } = await import("~/lib/validation");
    try {
      const data = parseForm(updateProfileSchema, form);

      const { default: prisma } = await import("~/db.server");
      await prisma.consignor.update({
        where: { id: consignor.id },
        data: {
          name: data.name,
          phone: data.phone || null,
          taxStatus: data.taxStatus,
          province: data.taxStatus === "business" ? (data.province || null) : null,
          gstNumber: data.taxStatus === "business" ? (data.gstNumber || null) : null,
          qstNumber: data.taxStatus === "business" && data.province === "QC" ? (data.qstNumber || null) : null,
        },
      });

      return { success: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Invalid input" };
    }
  }

  if (intent === "update-color") {
    try {
      const color = (form.get("color") as string ?? "").trim() || null;
      const { default: prisma } = await import("~/db.server");
      await prisma.consignor.update({
        where: { id: consignor.id },
        data: { avatarColor: color },
      });
      return { colorUpdated: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to update color" };
    }
  }

  if (intent === "update-notification-prefs") {
    try {
      const inApp = form.get("inApp") === "1";
      const email = form.get("email") === "1";
      const { default: prisma } = await import("~/db.server");
      await prisma.consignor.update({
        where: { id: consignor.id },
        data: { notificationPrefs: JSON.stringify({ inApp, email }) },
      });
      return { prefsUpdated: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to update preferences" };
    }
  }

  return { error: "Unknown action" };
}

export default function PortalProfile() {
  const { consignor } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");

  return (
    <ProfilePage
      consignor={consignor}
      notifications={parentData?.notifications}
    />
  );
}
