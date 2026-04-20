import { Link } from "react-router";
import { BarChart3 } from "lucide-react";

interface ConsignorListingsSummaryProps {
  consignorId: string;
  counts: Record<string, number>;
}

export function ConsignorListingsSummary({ consignorId, counts }: ConsignorListingsSummaryProps) {
  const totalListings = (counts.active ?? 0) + (counts.paused ?? 0) + (counts.pending_sale ?? 0) + (counts.sold ?? 0) + (counts.cancelled ?? 0);

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <BarChart3 size={16} color="rgba(109,113,117,0.6)" />
        <h2 className="admin-card-title">Listings Summary</h2>
        <span className="ml-auto text-[11px] font-semibold text-gray-500">
          {totalListings} total
        </span>
      </div>
      <div>
        <div className="flex justify-between items-center px-6 py-2.5 text-[13px] border-b border-gray-200/30">
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#1a7f37" }} />
            Active
          </span>
          <span className="font-semibold tabular-nums">{counts.active}</span>
        </div>
        {(counts.paused ?? 0) > 0 && (
          <div className="flex justify-between items-center px-6 py-2.5 text-[13px] border-b border-gray-200/30">
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#dc2626" }} />
              Paused
            </span>
            <span className="font-semibold tabular-nums">{counts.paused}</span>
          </div>
        )}
        <div className="flex justify-between items-center px-6 py-2.5 text-[13px] border-b border-gray-200/30">
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#b86e00" }} />
            Pending Sale
          </span>
          <span className="font-semibold tabular-nums">{counts.pending_sale}</span>
        </div>
        <div className="flex justify-between items-center px-6 py-2.5 text-[13px] border-b border-gray-200/30">
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#2c6ecb" }} />
            Sold
          </span>
          <span className="font-semibold tabular-nums">{counts.sold}</span>
        </div>
        <div className="flex justify-between items-center px-6 py-2.5 text-[13px]">
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#6d7175" }} />
            Cancelled
          </span>
          <span className="font-semibold tabular-nums">{counts.cancelled}</span>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-200/50">
        <Link
          to={`/app/payouts?consignor=${consignorId}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-600 no-underline"
        >
          View sales & payouts →
        </Link>
      </div>
    </div>
  );
}
