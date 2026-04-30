import { Link } from "react-router";
import { BUCKET_LABELS, type ListingBucket } from "~/lib/domain";

type Props = {
  activeTab: ListingBucket;
  bucketCounts: Record<ListingBucket, number>;
  buildTabUrl: (tab: ListingBucket) => string;
};

const TAB_ORDER: ListingBucket[] = ["active", "action_needed", "sold", "archive"];

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function StatusTabs({ activeTab, bucketCounts, buildTabUrl }: Props) {
  return (
    <div className="border-b border-gray-200 mb-4">
      <div className="flex items-center gap-1">
        {TAB_ORDER.map((tab) => {
          const isActive = tab === activeTab;
          const count = bucketCounts[tab] ?? 0;
          return (
            <Link
              key={tab}
              to={buildTabUrl(tab)}
              className={`relative inline-flex items-center gap-2 px-4 py-2.5 text-[13px] no-underline transition-colors ${
                isActive
                  ? "font-semibold text-gray-900"
                  : "font-medium text-gray-500 hover:text-gray-900"
              }`}
            >
              <span>{BUCKET_LABELS[tab]}</span>
              {count > 0 && (
                <span
                  className={`tabular-nums text-[11px] font-semibold rounded-full h-[18px] inline-flex items-center justify-center px-1.5 min-w-[22px] transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {formatCount(count)}
                </span>
              )}
              {isActive && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-gray-900 rounded-full" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
