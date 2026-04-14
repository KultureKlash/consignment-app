import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getActivityFeed } from "~/services/dashboard.server";
import { ArrowLeft, History } from "lucide-react";
import ActivityItem from "~/components/admin/ActivityItem";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const feed = await getActivityFeed(50);
  return { feed };
};

export default function Activity() {
  const { feed } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <div className="p-0">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/app"
            className="inline-flex items-center gap-1 text-gray-900 text-xs font-semibold bg-gray-900/[0.06] px-3.5 py-1.5 rounded-[10px] border border-gray-900/15 no-underline"
          >
            <ArrowLeft size={14} />
            Home
          </Link>
        </div>

        <div className="admin-card">
          <div className="admin-card-header justify-between">
            <div className="flex items-center gap-2">
              <History size={16} color="rgba(109,113,117,0.6)" />
              <h1 className="text-[13px] font-bold text-gray-900 uppercase tracking-wide m-0">
                Activity Feed
              </h1>
            </div>
            <span className="text-xs text-gray-500 font-medium">
              {feed.length} event{feed.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="px-6 py-3 pb-6">
            {feed.length === 0 ? (
              <div className="text-gray-500 text-sm py-6 text-center">
                No activity yet.
              </div>
            ) : (
              feed.map((item, i) => (
                <ActivityItem key={i} event={item.event} time={item.time} type={item.type} />
              ))
            )}
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
