import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData, useFetcher } from "react-router";
import { redirect } from "react-router";
import { MessageSquare, Bug, Lightbulb, HelpCircle, Check } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { authenticatePortal } from "~/services/portal/auth.server";
import { sendEmail } from "~/services/email.server";
import { logger } from "~/lib/logger.server";
import prisma from "~/db.server";
import type { loader as portalLoader } from "./portal";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const feedback = await prisma.feedback.findMany({
    where: { consignorId: consignor.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return { feedback };
}

export async function action({ request }: ActionFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const form = await request.formData();
  const type = form.get("type") as string;
  const message = (form.get("message") as string)?.trim();

  if (!message || message.length < 5) return { error: "Please write at least a few words." };
  if (!["bug", "suggestion", "other"].includes(type)) return { error: "Invalid type." };

  await prisma.feedback.create({
    data: { consignorId: consignor.id, type, message },
  });

  // Notify store via email
  const subject = `[Konsign Feedback] ${type === "bug" ? "Bug report" : type === "suggestion" ? "Suggestion" : "Message"} from ${consignor.name}`;
  sendEmail(
    process.env.RESEND_FROM_EMAIL || "noreply@konsign.shopkultureklash.com",
    subject,
    `<div style="font-family:sans-serif;max-width:500px;padding:24px;">
      <h2 style="margin:0 0 8px;font-size:18px;">${type === "bug" ? "🐛 Bug Report" : type === "suggestion" ? "💡 Suggestion" : "💬 Message"}</h2>
      <p style="color:#6b7280;margin:0 0 16px;">From <strong>${consignor.name}</strong> (${consignor.email})</p>
      <div style="background:#f3f4f6;padding:16px;border-radius:8px;white-space:pre-wrap;">${message}</div>
    </div>`,
  ).catch((err) => logger.error("Feedback email failed", { error: err instanceof Error ? err.message : String(err) }));

  return { ok: true };
}

const TYPE_OPTIONS = [
  { value: "bug", label: "Bug Report", icon: Bug, color: "text-red-400" },
  { value: "suggestion", label: "Suggestion", icon: Lightbulb, color: "text-amber-400" },
  { value: "other", label: "Other", icon: HelpCircle, color: "text-blue-400" },
];

export default function PortalFeedback() {
  const { feedback } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const fetcher = useFetcher();
  const [type, setType] = useState("bug");
  const [message, setMessage] = useState("");

  const isSubmitting = fetcher.state === "submitting";
  const result = fetcher.data as { ok?: boolean; error?: string } | undefined;
  const justSent = result?.ok;

  if (justSent && message) setMessage("");

  return (
    <>
      <AppHeader
        consignorName={parentData?.consignor.name ?? ""}
        avatarColor={parentData?.consignor.avatarColor ?? undefined}
        notifications={parentData?.notifications.items ?? []}
        unreadCount={parentData?.notifications.unreadCount ?? 0}
      />
      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Feedback</h1>
        <p className="text-sm text-muted-foreground mb-6">Report a bug or suggest an improvement.</p>

        <fetcher.Form method="post" className="glass-panel rounded-2xl p-5 mb-8 space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border ${
                  type === opt.value
                    ? "bg-white/[0.12] border-white/20 text-foreground"
                    : "bg-transparent border-transparent text-muted-foreground hover:bg-white/[0.06]"
                }`}
              >
                <opt.icon size={14} className={type === opt.value ? opt.color : ""} />
                {opt.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="type" value={type} />

          {/* Message */}
          <textarea
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={type === "bug" ? "Describe what happened and what you expected..." : type === "suggestion" ? "What would you like to see improved?" : "What's on your mind?"}
            className="glass-input w-full min-h-[120px] resize-y rounded-xl p-3 text-sm"
            maxLength={2000}
          />

          {result?.error && (
            <p className="text-sm text-red-400">{result.error}</p>
          )}

          {justSent && (
            <p className="text-sm text-green-400 flex items-center gap-1.5">
              <Check size={14} /> Thanks! Your feedback has been sent.
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !message.trim()}
            className="btn-cta px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
          >
            {isSubmitting ? "Sending..." : "Send Feedback"}
          </button>
        </fetcher.Form>

        {/* Past submissions */}
        {feedback.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Submissions</h2>
            <div className="space-y-2">
              {feedback.map((f) => (
                <div key={f.id} className="glass-panel rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {f.type === "bug" && <Bug size={13} className="text-red-400" />}
                    {f.type === "suggestion" && <Lightbulb size={13} className="text-amber-400" />}
                    {f.type === "other" && <HelpCircle size={13} className="text-blue-400" />}
                    <span className="text-xs font-medium capitalize">{f.type}</span>
                    <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      f.status === "resolved" ? "bg-green-500/20 text-green-400" : "bg-white/[0.08] text-muted-foreground"
                    }`}>
                      {f.status}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">{f.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
