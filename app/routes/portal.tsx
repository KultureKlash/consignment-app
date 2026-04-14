import { Outlet, redirect } from "react-router";
import type { LoaderFunctionArgs, LinksFunction } from "react-router";
import { useLoaderData } from "react-router";
import { authenticatePortal } from "~/services/portal/auth.server";
import { getConsignorNotifications } from "~/services/portal/notifications.server";
import { Sidebar, BottomTabBar } from "~/components/portal/Sidebar";
import portalStyles from "~/portal.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: portalStyles },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const notifications = await getConsignorNotifications(consignor.id, consignor.notificationsReadAt, consignor.notificationPrefs);
  return {
    consignor: { id: consignor.id, name: consignor.name, email: consignor.email, avatarColor: consignor.avatarColor, storeOwned: consignor.storeOwned },
    notifications,
  };
}

export default function PortalLayout() {
  const { consignor } = useLoaderData<typeof loader>();

  return (
    <div className="portal-root min-h-screen relative">
      {/* Background image + dark overlay — same as login */}
      <div
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/sneakers.jpg)" }}
      />
      <div className="fixed inset-0 backdrop-blur-md" style={{ background: "rgba(0, 0, 0, 0.92)" }} />

      {/* Content on top */}
      <div className="relative z-10 min-h-screen">
        <Sidebar consignorName={consignor.name} />
        <main className="lg:ml-[260px] min-h-screen pb-20 lg:pb-0">
          <Outlet />
        </main>
        <BottomTabBar />
      </div>
    </div>
  );
}
