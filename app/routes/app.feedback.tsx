import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { Bug, Lightbulb, HelpCircle, CheckCircle, Clock } from "lucide-react";
import prisma from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const feedback = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    include: { consignor: { select: { name: true, email: true } } },
    take: 100,
  });

  const openCount = await prisma.feedback.count({ where: { status: "open" } });

  return { feedback, openCount };
}

export async function action({ request }: ActionFunctionArgs) {
  await authenticate.admin(request);
  const form = await request.formData();
  const id = form.get("id") as string;
  const intent = form.get("intent") as string;

  if (intent === "resolve") {
    await prisma.feedback.update({ where: { id }, data: { status: "resolved" } });
  } else if (intent === "reopen") {
    await prisma.feedback.update({ where: { id }, data: { status: "open" } });
  }

  return { ok: true };
}

const TYPE_ICONS: Record<string, { icon: typeof Bug; color: string; label: string }> = {
  bug: { icon: Bug, color: "text-red-500", label: "Bug" },
  suggestion: { icon: Lightbulb, color: "text-amber-500", label: "Suggestion" },
  other: { icon: HelpCircle, color: "text-blue-500", label: "Other" },
};

export default function AdminFeedback() {
  const { feedback, openCount } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <s-page heading={`Feedback${openCount > 0 ? ` (${openCount} open)` : ""}`}>
      <s-section>
        {feedback.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No feedback yet.</div>
        ) : (
          <div className="space-y-3">
            {feedback.map((f) => {
              const typeInfo = TYPE_ICONS[f.type] ?? TYPE_ICONS.other;
              const Icon = typeInfo.icon;
              const isOpen = f.status === "open";

              return (
                <div key={f.id} className={`admin-card p-4 ${isOpen ? "" : "opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${typeInfo.color}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900">{f.consignor.name}</span>
                        <span className="text-xs text-gray-400 hidden md:inline">{f.consignor.email}</span>
                        <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${
                          isOpen ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"
                        }`}>
                          {isOpen ? <Clock size={10} /> : <CheckCircle size={10} />}
                          {f.status}
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${typeInfo.color}`}>{typeInfo.label}</span>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{f.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-400">
                          {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                        <fetcher.Form method="post" className="ml-auto">
                          <input type="hidden" name="id" value={f.id} />
                          <button
                            type="submit"
                            name="intent"
                            value={isOpen ? "resolve" : "reopen"}
                            className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                              isOpen
                                ? "text-green-600 bg-green-50 hover:bg-green-100"
                                : "text-gray-500 bg-gray-50 hover:bg-gray-100"
                            }`}
                          >
                            {isOpen ? "Mark Resolved" : "Reopen"}
                          </button>
                        </fetcher.Form>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </s-section>
    </s-page>
  );
}
