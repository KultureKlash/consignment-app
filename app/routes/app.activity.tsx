import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getActivityFeed } from "~/services/dashboard.server";
import { ArrowLeft, History } from "lucide-react";
import ActivityItem from "~/components/admin/ActivityItem";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const feed = await getActivityFeed(0);
  return { feed };
};

export default function Activity() {
  const { feed } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <div style={{ padding: "0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <Link
            to="/app"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              color: "#111827",
              fontSize: "12px",
              fontWeight: 600,
              background: "rgba(17,24,39,0.06)",
              padding: "6px 14px",
              borderRadius: "10px",
              border: "1px solid rgba(17,24,39,0.15)",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} />
            Home
          </Link>
        </div>

        <div style={{
          background: "#ffffff",
          border: "1px solid rgba(227,227,227,0.6)",
          borderRadius: "12px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "16px 24px",
            borderBottom: "1px solid rgba(227,227,227,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <History size={16} color="rgba(109,113,117,0.6)" />
              <h1 style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "#1a1a1a",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                margin: 0,
              }}>
                Activity Feed
              </h1>
            </div>
            <span style={{ fontSize: "12px", color: "#6d7175", fontWeight: 500 }}>
              {feed.length} event{feed.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ padding: "12px 24px 24px" }}>
            {feed.length === 0 ? (
              <div style={{ color: "#6d7175", fontSize: "14px", padding: "24px 0", textAlign: "center" }}>
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
