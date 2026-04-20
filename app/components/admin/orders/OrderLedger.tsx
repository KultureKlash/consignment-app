import { FileText } from "lucide-react";
import { fmt } from "~/lib/currency";
import { TRANSACTION_TYPE } from "~/lib/order-statuses";

const txTypeColors: Record<string, { bg: string; color: string }> = {
  [TRANSACTION_TYPE.SALE]: { bg: "#ecfdf5", color: "#059669" },
  [TRANSACTION_TYPE.REFUND]: { bg: "#fffbeb", color: "#d97706" },
  void: { bg: "#fef2f2", color: "#dc2626" },
};

interface OrderLedgerProps {
  items: any[];
}

export function OrderLedger({ items }: OrderLedgerProps) {
  const allTxs = items.flatMap((item) =>
    item.transactions.map((tx: any) => ({
      ...tx,
      productTitle: item.listing.variant.product.title,
      size: item.listing.variant.size,
    })),
  );
  allTxs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <FileText size={15} color="#6d7175" />
        <h2 className="admin-card-title">Financial Ledger</h2>
      </div>
      <div>
        {allTxs.length === 0 ? (
          <div className="px-5 py-6 text-center text-gray-400 text-[13px]">
            No transactions yet. Payment pending.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden md:table w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200/50">
                  <th className="admin-th !px-5 !text-[10px] tracking-wider">Type</th>
                  <th className="admin-th !px-3 !text-[10px] tracking-wider">Item</th>
                  <th className="admin-th !px-3 !text-[10px] tracking-wider text-right">Gross</th>
                  <th className="admin-th !px-3 !text-[10px] tracking-wider text-right">Fee</th>
                  <th className="admin-th !px-5 !text-[10px] tracking-wider text-right">Payout</th>
                </tr>
              </thead>
              <tbody>
                {allTxs.map((tx, i) => {
                  const colors = txTypeColors[tx.type] ?? { bg: "#f3f4f6", color: "#6d7175" };
                  return (
                    <tr key={i} className="border-b border-gray-200/30">
                      <td className="admin-td !px-5">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide inline-block"
                          style={{ background: colors.bg, color: colors.color }}
                        >
                          {tx.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="admin-td !px-3 text-gray-700">
                        {tx.productTitle} · {tx.size}
                      </td>
                      <td className="admin-td !px-3 text-right tabular-nums font-medium" style={{ color: tx.grossAmount < 0 ? "#dc2626" : "#1a1a1a" }}>
                        {tx.grossAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.grossAmount))}
                      </td>
                      <td className="admin-td !px-3 text-right tabular-nums font-semibold" style={{ color: tx.feeAmount < 0 ? "#dc2626" : "#059669" }}>
                        {tx.feeAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.feeAmount))}
                      </td>
                      <td className="admin-td !px-5 text-right tabular-nums" style={{ color: tx.consignorAmount < 0 ? "#dc2626" : "#6d7175" }}>
                        {tx.consignorAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.consignorAmount))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile card view */}
            <div className="md:hidden divide-y divide-gray-200/30">
              {allTxs.map((tx, i) => {
                const colors = txTypeColors[tx.type] ?? { bg: "#f3f4f6", color: "#6d7175" };
                return (
                  <div key={i} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide inline-block"
                        style={{ background: colors.bg, color: colors.color }}
                      >
                        {tx.type.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-700 truncate">{tx.productTitle} · {tx.size}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="font-medium" style={{ color: tx.grossAmount < 0 ? "#dc2626" : "#1a1a1a" }}>
                        Gross: {tx.grossAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.grossAmount))}
                      </span>
                      <span className="font-semibold" style={{ color: tx.feeAmount < 0 ? "#dc2626" : "#059669" }}>
                        Fee: {tx.feeAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.feeAmount))}
                      </span>
                      <span style={{ color: tx.consignorAmount < 0 ? "#dc2626" : "#6d7175" }}>
                        Payout: {tx.consignorAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.consignorAmount))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
