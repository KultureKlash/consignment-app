import { useEffect } from "react";
import type { FetcherWithComponents } from "react-router";

type ShopifyAppBridge = { toast: { show: (msg: string) => void } };
type FetcherData = Record<string, unknown> | undefined;

/**
 * Shows toast notifications in response to listing action fetcher results.
 * Accepts an optional callback to run after certain intents (e.g. clearing selection).
 */
export function useListingToasts(
  shopify: ShopifyAppBridge,
  fetchers: {
    cancel: FetcherWithComponents<unknown>;
    add: FetcherWithComponents<unknown>;
    approval: FetcherWithComponents<unknown>;
  },
  callbacks?: {
    clearSelection?: () => void;
    closeQuickAdd?: () => void;
  },
) {
  // Cancel / bulk-cancel toasts
  useEffect(() => {
    const data = fetchers.cancel.data as FetcherData;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.intent === "delete") {
      shopify.toast.show("Listing deleted");
    } else if (data.intent === "bulk-delete") {
      const count = data.cancelled as number;
      const syncErrors = (data.syncErrors as string[]) ?? [];
      const msg = `Deleted ${count} listing${count !== 1 ? "s" : ""}`;
      shopify.toast.show(
        syncErrors.length > 0
          ? `${msg} (Shopify sync had ${syncErrors.length} error${syncErrors.length !== 1 ? "s" : ""} — will retry)`
          : msg,
      );
      callbacks?.clearSelection?.();
    }
  }, [fetchers.cancel.data, shopify]);

  // Quick-add toast
  useEffect(() => {
    const data = fetchers.add.data as FetcherData;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.intent === "quick-add") {
      const qty = (data.quantity as number) ?? 1;
      shopify.toast.show(`Added ${qty} listing${qty !== 1 ? "s" : ""}`);
      callbacks?.closeQuickAdd?.();
    }
  }, [fetchers.add.data, shopify]);

  // Approval / reject / check-in / edit / withdrawal toasts
  useEffect(() => {
    const data = fetchers.approval.data as FetcherData;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
      return;
    }
    const messages: Record<string, string> = {
      approve: "Listing approved",
      reject: "Listing rejected",
      checkin: "Listing checked in & synced to Shopify",
      "admin-edit-approve": "Listing updated & approved",
      "admin-edit": "Listing updated",
      "approve-withdrawal": "Withdrawal approved — pending pickup",
      "complete-withdrawal": "Withdrawal complete — item withdrawn",
    };
    const intent = data.intent as string;
    if (messages[intent]) {
      shopify.toast.show(messages[intent]);
      return;
    }
    if (intent === "bulk-approve") {
      const count = data.approved as number;
      shopify.toast.show(`Approved ${count} listing${count !== 1 ? "s" : ""}`);
      callbacks?.clearSelection?.();
    } else if (intent === "bulk-checkin") {
      const count = data.activated as number;
      const syncErrors = (data.syncErrors as string[]) ?? [];
      const msg = `Checked in ${count} listing${count !== 1 ? "s" : ""}`;
      shopify.toast.show(
        syncErrors.length > 0
          ? `${msg} (${syncErrors.length} sync error${syncErrors.length !== 1 ? "s" : ""})`
          : msg,
      );
      callbacks?.clearSelection?.();
    } else if (intent === "bulk-approve-withdrawal") {
      const count = data.approved as number;
      shopify.toast.show(`Approved ${count} withdrawal${count !== 1 ? "s" : ""} — pending pickup`);
      callbacks?.clearSelection?.();
    } else if (intent === "bulk-deny-withdrawal") {
      const count = data.denied as number;
      shopify.toast.show(`Denied ${count} withdrawal${count !== 1 ? "s" : ""}`);
      callbacks?.clearSelection?.();
    } else if (intent === "bulk-complete-withdrawal") {
      const count = data.completed as number;
      shopify.toast.show(`Marked ${count} withdrawal${count !== 1 ? "s" : ""} as picked up`);
      callbacks?.clearSelection?.();
    } else if (intent === "bulk-edit") {
      const listings = (data.listingsUpdated as number | undefined) ?? 0;
      const products = (data.productsUpdated as number | undefined) ?? 0;
      shopify.toast.show(
        products > 0
          ? `Updated ${listings} listing${listings !== 1 ? "s" : ""} across ${products} product${products !== 1 ? "s" : ""}`
          : `Updated ${listings} listing${listings !== 1 ? "s" : ""}`,
      );
      callbacks?.clearSelection?.();
    }
  }, [fetchers.approval.data, shopify]);
}
