import { useState } from "react";
import { useFetcher } from "react-router";
import { User, Mail, Phone, Save, Check, Palette, Bell } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { TaxSettings } from "./TaxSettings";
import { AccountInfo } from "./AccountInfo";
import type { PortalNotification } from "~/services/portal/notifications.server";
import type { action } from "~/routes/portal.profile";

const AVATAR_COLORS = [
  { name: "Slate",    value: "hsl(220, 20%, 30%)" },
  { name: "Rose",     value: "hsl(350, 55%, 42%)" },
  { name: "Ember",    value: "hsl(20, 60%, 40%)" },
  { name: "Gold",     value: "hsl(40, 60%, 40%)" },
  { name: "Sage",     value: "hsl(152, 45%, 35%)" },
  { name: "Teal",     value: "hsl(175, 55%, 33%)" },
  { name: "Ocean",    value: "hsl(215, 60%, 40%)" },
  { name: "Indigo",   value: "hsl(240, 50%, 45%)" },
  { name: "Violet",   value: "hsl(270, 50%, 43%)" },
  { name: "Berry",    value: "hsl(325, 50%, 40%)" },
];

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

interface ProfileConsignor {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  taxStatus: string;
  province: string | null;
  gstNumber: string | null;
  qstNumber: string | null;
  feeRate: number;
  avatarColor: string | null;
  notificationPrefs: string | null;
  createdAt: string | Date;
}

interface ProfilePageProps {
  consignor: ProfileConsignor;
  notifications?: { items: PortalNotification[]; unreadCount: number };
}

export function ProfilePage({ consignor, notifications }: ProfilePageProps) {
  const fetcher = useFetcher<typeof action>();
  const colorFetcher = useFetcher();
  const prefsFetcher = useFetcher();

  const [name, setName] = useState(consignor.name);
  const [phoneVal, setPhoneVal] = useState(consignor.phone ?? "");
  const [taxStatus, setTaxStatus] = useState(consignor.taxStatus);
  const [province, setProvince] = useState(consignor.province ?? "");
  const [gstNumber, setGstNumber] = useState(consignor.gstNumber ?? "");
  const [qstNumber, setQstNumber] = useState(consignor.qstNumber ?? "");
  const [selectedColor, setSelectedColor] = useState(consignor.avatarColor || AVATAR_COLORS[0].value);

  // Parse notification prefs
  const parsedPrefs = (() => {
    try {
      const p = consignor.notificationPrefs ? JSON.parse(consignor.notificationPrefs as string) : null;
      return p;
    } catch { return null; }
  })();
  const [notifPrefs, setNotifPrefs] = useState({
    inApp: parsedPrefs?.inApp !== false,
    email: parsedPrefs?.email !== false,
  });

  const hasChanges =
    name.trim() !== consignor.name ||
    (phoneVal.trim() || null) !== (consignor.phone || null) ||
    taxStatus !== consignor.taxStatus ||
    (province || null) !== (consignor.province || null) ||
    (gstNumber.trim() || null) !== (consignor.gstNumber || null) ||
    (qstNumber.trim() || null) !== (consignor.qstNumber || null);
  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.success && !hasChanges;

  const feePercent = Math.round(consignor.feeRate * 100);
  const payoutPercent = 100 - feePercent;
  const memberSince = new Date(consignor.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  function handleColorPick(color: string) {
    setSelectedColor(color);
    colorFetcher.submit(
      { intent: "update-color", color },
      { method: "POST" }
    );
  }

  function handleToggleNotif(key: "inApp" | "email") {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    const formData: Record<string, string> = { intent: "update-notification-prefs" };
    if (updated.inApp) formData.inApp = "1";
    if (updated.email) formData.email = "1";
    prefsFetcher.submit(formData, { method: "POST" });
  }

  return (
    <div>
      <AppHeader
        title="Settings"
        subtitle="Manage your account"
        consignorName={consignor.name}
        avatarColor={selectedColor}
        notifications={notifications}
      />

      <div className="px-4 md:px-8 pb-8 max-w-2xl mx-auto space-y-6">
        {/* Avatar color picker */}
        <div className="glass-panel rounded-2xl p-6 animate-slide-up" style={{ animationDelay: "40ms" }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-white/[0.08] flex items-center justify-center">
              <Palette className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Avatar</h2>
              <p className="text-xs text-muted-foreground">Choose your badge color</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Preview */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 transition-all duration-300"
              style={{
                background: selectedColor,
                color: "#fff",
                boxShadow: `0 0 20px -3px ${selectedColor}, 0 0 40px -8px ${selectedColor}`,
              }}
            >
              {getInitials(consignor.name)}
            </div>

            {/* Color grid */}
            <div className="flex flex-wrap gap-2.5">
              {AVATAR_COLORS.map((c) => {
                const isSelected = selectedColor === c.value;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => handleColorPick(c.value)}
                    title={c.name}
                    className="w-8 h-8 rounded-full cursor-pointer transition-all duration-200 hover:scale-110"
                    style={{
                      background: c.value,
                      boxShadow: isSelected ? `0 0 12px -1px ${c.value}` : "none",
                      outline: isSelected ? `2px solid rgba(255,255,255,0.6)` : "2px solid transparent",
                      outlineOffset: "2px",
                      opacity: isSelected ? 1 : 0.7,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Profile card */}
        <div className="glass-panel rounded-2xl p-6 animate-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-white/[0.08] flex items-center justify-center">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Profile</h2>
              <p className="text-xs text-muted-foreground">Your account information</p>
            </div>
          </div>

          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="update-profile" />

            {/* Name */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/60 pointer-events-none" />
                <input
                  type="text"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="glass-input w-full pl-10 pr-3 py-2.5 rounded-xl text-sm"
                  placeholder="Your name"
                />
              </div>
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/60 pointer-events-none" />
                <input
                  type="email"
                  value={consignor.email}
                  readOnly
                  className="glass-input w-full pl-10 pr-3 py-2.5 rounded-xl text-sm opacity-60 cursor-not-allowed"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Contact admin to change your email</p>
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Phone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/60 pointer-events-none" />
                <input
                  type="tel"
                  name="phone"
                  value={phoneVal}
                  onChange={(e) => setPhoneVal(e.target.value)}
                  className="glass-input w-full pl-10 pr-3 py-2.5 rounded-xl text-sm"
                  placeholder="Your phone number"
                />
              </div>
            </div>

            <TaxSettings
              taxStatus={taxStatus}
              province={province}
              gstNumber={gstNumber}
              qstNumber={qstNumber}
              onTaxStatusChange={setTaxStatus}
              onProvinceChange={setProvince}
              onGstNumberChange={setGstNumber}
              onQstNumberChange={setQstNumber}
            />

            {/* Save */}
            {fetcher.data?.error && (
              <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {fetcher.data.error}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={!hasChanges || isSaving}
                className="btn-cta px-6 py-3 text-sm flex items-center gap-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                {saved ? (
                  <>
                    <Check className="w-4 h-4" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </>
                )}
              </button>
            </div>
          </fetcher.Form>
        </div>

        <AccountInfo
          feePercent={feePercent}
          payoutPercent={payoutPercent}
          memberSince={memberSince}
        />

        {/* Notifications */}
        <div className="glass-panel rounded-2xl animate-slide-up overflow-hidden" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center gap-3 px-6 pt-6 pb-4">
            <div className="text-sm font-semibold">Notifications</div>
          </div>

          <div className="border-t border-white/[0.06]">
            {([
              { key: "inApp" as const, label: "In-App Notifications", desc: "Sale updates and alerts", icon: Bell },
              { key: "email" as const, label: "Email Notifications", desc: "Listing & withdrawal updates (sales and payments always send)", icon: Mail },
            ]).map((item, i) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleToggleNotif(item.key)}
                className={`w-full flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer ${
                  i < 1 ? "border-b border-white/[0.06]" : ""
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-left flex-1">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-[11px] text-muted-foreground">{item.desc}</div>
                </div>
                <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${notifPrefs[item.key] ? "bg-[hsl(var(--cta))]" : "bg-white/10"}`}>
                  <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full shadow-sm transition-transform duration-200 bg-white ${notifPrefs[item.key] ? "translate-x-5" : "translate-x-0"}`} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
