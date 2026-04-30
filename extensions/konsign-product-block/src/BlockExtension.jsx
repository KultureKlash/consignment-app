import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { data } = shopify;
  const productGid = data?.product?.id;
  const appUrl = data?.app?.applicationUrl;

  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productGid || !appUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await shopify.auth.idToken();
        const url = new URL("/app/api/product-block", appUrl);
        url.searchParams.set("id", productGid);
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setInfo(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productGid, appUrl]);

  if (loading) {
    return (
      <s-admin-block heading="Konsign Inventory">
        <s-stack direction="block" gap="small-200">
          <s-spinner accessibilityLabel="Loading" />
        </s-stack>
      </s-admin-block>
    );
  }

  if (error) {
    return (
      <s-admin-block heading="Konsign Inventory">
        <s-text color="critical">Couldn't load Konsign data: {error}</s-text>
      </s-admin-block>
    );
  }

  if (!info?.found) {
    return (
      <s-admin-block heading="Konsign Inventory">
        <s-text color="subdued">This product isn't synced to Konsign yet.</s-text>
      </s-admin-block>
    );
  }

  const { totalActive, lowest, variants, actions } = info;
  const actionItems = [
    { count: actions.awaitingPrice, label: "awaiting price" },
    { count: actions.submitted, label: "submitted (pending review)" },
    { count: actions.awaitingDropoff, label: "awaiting drop-off" },
    { count: actions.withdrawalRequested, label: "withdrawal requested" },
    { count: actions.pendingPickup, label: "pending pickup" },
  ].filter((a) => a.count > 0);

  const launchUrl = `${appUrl}app/listings?search=${encodeURIComponent(info.product.title)}`;

  return (
    <s-admin-block heading="Konsign Inventory">
      <s-stack direction="block" gap="base">
        {/* Headline summary */}
        <s-stack direction="inline" gap="base">
          <s-stack direction="block" gap="extra-tight">
            <s-text type="strong">{totalActive} active listing{totalActive !== 1 ? "s" : ""}</s-text>
            {lowest && (
              <s-text color="subdued">
                Lowest ${lowest.price.toFixed(2)} · {lowest.owner}
              </s-text>
            )}
          </s-stack>
        </s-stack>

        {/* Action items banner */}
        {actionItems.length > 0 && (
          <s-banner tone="warning">
            <s-stack direction="block" gap="extra-tight">
              {actionItems.map((a) => (
                <s-text key={a.label}>{a.count} {a.label}</s-text>
              ))}
            </s-stack>
          </s-banner>
        )}

        {/* Per-variant breakdown */}
        {variants.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header>Size</s-table-header>
              <s-table-header>Listings</s-table-header>
              <s-table-header>Lowest</s-table-header>
              <s-table-header>Owner</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {variants.map((v) => (
                <s-table-row key={v.variantId}>
                  <s-table-cell>{v.size}</s-table-cell>
                  <s-table-cell>
                    {v.activeCount}
                    {v.needsPrice > 0 && (
                      <s-text color="subdued"> +{v.needsPrice} unpriced</s-text>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    {v.lowestPrice != null ? `$${v.lowestPrice.toFixed(2)}` : "—"}
                  </s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">{v.lowestOwner ?? "—"}</s-text>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}

        {/* Deep link */}
        <s-link href={launchUrl} target="_top">
          Open in Konsign →
        </s-link>
      </s-stack>
    </s-admin-block>
  );
}
