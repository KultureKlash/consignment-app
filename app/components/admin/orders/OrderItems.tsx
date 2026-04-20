import { Link } from "react-router";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import { Package } from "lucide-react";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { ORDER_PAYMENT_STATUS, TRANSACTION_TYPE } from "~/lib/order-statuses";

const statusColors: Record<string, { bg: string; color: string }> = {
  [LISTING_STATUS.SOLD]: { bg: "#ecfdf5", color: "#059669" },
  [LISTING_STATUS.PENDING_SALE]: { bg: "#fffbeb", color: "#d97706" },
};

interface OrderItemsProps {
  items: any[];
  paymentStatus: string;
  itemCount: number;
  refundedCount: number;
}

export function OrderItems({ items, paymentStatus, itemCount, refundedCount }: OrderItemsProps) {
  return (
    <div className="admin-card mb-6">
      <div className="admin-card-header">
        <Package size={15} color="#6d7175" />
        <h2 className="admin-card-title">Items</h2>
        <span className="ml-auto text-[11px] font-semibold text-gray-500">
          {itemCount} item{itemCount !== 1 ? "s" : ""}
          {refundedCount > 0 ? ` · ${refundedCount} refunded` : ""}
        </span>
      </div>
      {/* Desktop table */}
      <table className="hidden md:table w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-gray-200/60">
            <th className="admin-th !px-5">Product</th>
            <th className="admin-th !px-4">Consignor</th>
            <th className="admin-th !px-4 text-center w-[100px]">Status</th>
            <th className="admin-th !px-5 text-right w-[100px]">Price</th>
          </tr>
        </thead>
        <tbody>
        {items.map((item, i) => {
          const product = item.listing.variant.product;
          const variant = item.listing.variant;
          const consignor = item.listing.consignor;
          const saleTx = item.transactions.find((tx: any) => tx.type === TRANSACTION_TYPE.SALE);
          const isLast = i === items.length - 1;
          const isPending = paymentStatus === ORDER_PAYMENT_STATUS.PENDING && item.status === LISTING_STATUS.SOLD;
          const displayStatus = isPending ? "pending" : item.status;
          const displayColors = isPending
            ? { bg: "#fffbeb", color: "#d97706" }
            : (statusColors[item.status] ?? { bg: "#f3f4f6", color: "#6d7175" });

          return (
            <tr
              key={item.id}
              className={isLast ? "" : "border-b border-gray-200/40"}
            >
              {/* Product info */}
              <td className="admin-td !px-5 !py-3 align-top">
                <div className="font-semibold text-[13px] text-gray-900 mb-0.5">
                  {product.shopifyProductId ? (
                    <a
                      href={`shopify://admin/products/${product.shopifyProductId.replace("gid://shopify/Product/", "")}`}
                      target="_top"
                      className="hover:underline"
                    >
                      {product.title}
                    </a>
                  ) : product.title}
                </div>
                <div className="text-xs text-gray-500">
                  Size {variant.size}
                  {product.sku && <span className="text-gray-400"> · {product.sku}</span>}
                </div>
              </td>
              {/* Consignor */}
              <td className="admin-td !px-4 !py-3 align-top">
                <div className="mb-0.5">
                  <Link to={`/app/consignors/${consignor.id}`} className="text-[13px] font-semibold text-gray-900 no-underline">
                    {consignor.name}
                  </Link>
                  <span className="text-xs text-gray-400"> ({(consignor.feeRate * 100).toFixed(0)}%)</span>
                </div>
                {saleTx && (
                  <>
                    <div className="text-xs text-gray-500">
                      {consignor.storeOwned ? (
                        <>
                          Cost <span className="font-semibold text-gray-500">${fmt(saleTx.cost)}</span>
                          <span className="text-gray-300"> · </span>
                          Profit <span className="font-semibold text-emerald-600">${fmt(saleTx.grossAmount - saleTx.cost)}</span>
                        </>
                      ) : (
                        <>
                          Fee <span className="font-semibold text-emerald-600">${fmt(saleTx.feeAmount)}</span>
                          <span className="text-gray-300"> · </span>
                          Payout <span className="font-semibold text-gray-500">${fmt(saleTx.consignorAmount)}</span>
                        </>
                      )}
                    </div>
                    {(() => {
                      if (consignor.storeOwned) return null;
                      const tax = computeTax(saleTx.consignorAmount, consignor);
                      if (!tax.isTaxable) return null;
                      return (
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {tax.gst > 0 && `+GST $${fmt(tax.gst)} `}
                          {tax.qst > 0 && `+QST $${fmt(tax.qst)} `}
                          {tax.hst > 0 && `+${tax.taxLabel} $${fmt(tax.hst)} `}
                          = <strong className="text-gray-500">${fmt(tax.total)}</strong> payable
                        </div>
                      );
                    })()}
                  </>
                )}
              </td>
              {/* Status */}
              <td className="admin-td !px-4 !py-3 text-center align-top">
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize tracking-wide inline-block"
                  style={{ background: displayColors.bg, color: displayColors.color }}
                >
                  {displayStatus.replace("_", " ")}
                </span>
              </td>
              {/* Price */}
              <td className="admin-td !px-5 !py-3 text-right align-top font-bold text-sm text-gray-900 tabular-nums whitespace-nowrap">
                ${fmt(item.price)}
              </td>
            </tr>
          );
        })}
        </tbody>
      </table>

      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-gray-200/40">
        {items.map((item) => {
          const product = item.listing.variant.product;
          const variant = item.listing.variant;
          const consignor = item.listing.consignor;
          const saleTx = item.transactions.find((tx: any) => tx.type === TRANSACTION_TYPE.SALE);
          const isPending = paymentStatus === ORDER_PAYMENT_STATUS.PENDING && item.status === LISTING_STATUS.SOLD;
          const displayStatus = isPending ? "pending" : item.status;
          const displayColors = isPending
            ? { bg: "#fffbeb", color: "#d97706" }
            : (statusColors[item.status] ?? { bg: "#f3f4f6", color: "#6d7175" });

          return (
            <div key={item.id} className="px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[13px] text-gray-900 mb-0.5 truncate">
                    {product.shopifyProductId ? (
                      <a
                        href={`shopify://admin/products/${product.shopifyProductId.replace("gid://shopify/Product/", "")}`}
                        target="_top"
                        className="hover:underline"
                      >
                        {product.title}
                      </a>
                    ) : product.title}
                  </div>
                  <div className="text-xs text-gray-500">
                    Size {variant.size}
                    {product.sku && <span className="text-gray-400"> · {product.sku}</span>}
                  </div>
                </div>
                <div className="font-bold text-sm text-gray-900 tabular-nums whitespace-nowrap">
                  ${fmt(item.price)}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-500">
                  <Link to={`/app/consignors/${consignor.id}`} className="font-semibold text-gray-900 no-underline">
                    {consignor.name}
                  </Link>
                  <span className="text-gray-400"> ({(consignor.feeRate * 100).toFixed(0)}%)</span>
                </div>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize tracking-wide inline-block shrink-0"
                  style={{ background: displayColors.bg, color: displayColors.color }}
                >
                  {displayStatus.replace("_", " ")}
                </span>
              </div>
              {saleTx && (
                <div className="text-xs text-gray-500">
                  {consignor.storeOwned ? (
                    <>
                      Cost <span className="font-semibold text-gray-500">${fmt(saleTx.cost)}</span>
                      <span className="text-gray-300"> · </span>
                      Profit <span className="font-semibold text-emerald-600">${fmt(saleTx.grossAmount - saleTx.cost)}</span>
                    </>
                  ) : (
                    <>
                      Fee <span className="font-semibold text-emerald-600">${fmt(saleTx.feeAmount)}</span>
                      <span className="text-gray-300"> · </span>
                      Payout <span className="font-semibold text-gray-500">${fmt(saleTx.consignorAmount)}</span>
                      {(() => {
                        const tax = computeTax(saleTx.consignorAmount, consignor);
                        if (!tax.isTaxable) return null;
                        return (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {tax.gst > 0 && `+GST $${fmt(tax.gst)} `}
                            {tax.qst > 0 && `+QST $${fmt(tax.qst)} `}
                            {tax.hst > 0 && `+${tax.taxLabel} $${fmt(tax.hst)} `}
                            = <strong className="text-gray-500">${fmt(tax.total)}</strong> payable
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
