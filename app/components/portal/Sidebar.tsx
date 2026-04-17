import { NavLink, Form } from "react-router";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  DollarSign,
  User,
  MessageSquare,
  LogOut,
} from "lucide-react";

const navItems = [
  { to: "/portal/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/portal/listings", icon: Package, label: "Listings" },
  { to: "/portal/sales", icon: ShoppingBag, label: "Sales" },
  { to: "/portal/payouts", icon: DollarSign, label: "Payouts" },
  { to: "/portal/feedback", icon: MessageSquare, label: "Feedback" },
  { to: "/portal/profile", icon: User, label: "Settings" },
];

export function Sidebar({ consignorName }: { consignorName: string }) {
  return (
    <aside
      className="hidden lg:flex fixed top-0 left-0 bottom-0 w-[260px] flex-col border-r border-[rgba(255,255,255,0.08)] backdrop-blur-2xl z-50"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
    >
      {/* Logo */}
      <div className="px-6 pt-6 pb-12 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[rgba(255,255,255,0.1)] flex items-center justify-center glow-border">
          <span className="text-base font-extrabold text-primary tracking-tighter">K</span>
        </div>
        <span className="text-lg font-bold text-foreground tracking-tight">Konsign</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-item ${isActive ? "nav-item-active" : ""}`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[rgba(255,255,255,0.08)]">
        <div className="text-sm text-muted-foreground mb-3 px-1 truncate">{consignorName}</div>
        <Form method="post" action="/portal/logout">
          <button
            type="submit"
            className="nav-item w-full text-left"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </Form>
      </div>
    </aside>
  );
}

export function BottomTabBar() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t border-[rgba(255,255,255,0.08)] backdrop-blur-2xl"
      style={{ background: "rgba(0, 0, 0, 0.7)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
