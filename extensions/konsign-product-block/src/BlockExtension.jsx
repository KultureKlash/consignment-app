import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { data } = shopify;
  const productGid = data?.selected?.[0]?.id;

  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productGid) {
      setError("No product selected");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await shopify.query(
          `query GetSummary($id: ID!) {
            product(id: $id) {
              metafield(namespace: "konsign", key: "summary") { value }
            }
          }`,
          { variables: { id: productGid } },
        );
        const valueStr = res?.data?.product?.metafield?.value;
        if (!valueStr) {
          if (!cancelled) {
            setInfo(null);
            setLoading(false);
          }
          return;
        }
        const parsed = JSON.parse(valueStr);
        if (!cancelled) {
          setInfo(parsed);
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
  }, [productGid]);

  if (loading) {
    return (
      <s-admin-block heading="Konsign Inventory">
        <s-spinner accessibilityLabel="Loading" />
      </s-admin-block>
    );
  }

  if (error) {
    return (
      <s-admin-block heading="Konsign Inventory">
        <s-paragraph tone="critical">Couldn't load: {error}</s-paragraph>
      </s-admin-block>
    );
  }

  if (!info) {
    return (
      <s-admin-block heading="Konsign Inventory">
        <s-paragraph tone="neutral">
          No Konsign data for this product yet. It will populate the next time a listing on this
          product changes.
        </s-paragraph>
      </s-admin-block>
    );
  }

  const { totalActive, lowest, variants, actions } = info;
  const actionItems = [
    { count: actions.awaitingPrice, label: "awaiting price" },
    { count: actions.submitted, label: "submitted" },
    { count: actions.awaitingDropoff, label: "awaiting drop-off" },
    { count: actions.withdrawalRequested, label: "withdrawal requested" },
    { count: actions.pendingPickup, label: "pending pickup" },
  ].filter((a) => a.count > 0);

  return (
    <s-admin-block heading="Konsign Inventory">
      <s-stack direction="block" gap="base">
        {/* Headline — count + lowest price */}
        <s-stack direction="block" gap="extra-tight">
          <s-text type="strong">
            {totalActive} active listing{totalActive !== 1 ? "s" : ""}
          </s-text>
          {lowest && (
            <s-text color="subdued">
              Lowest <s-text type="strong">${lowest.price.toFixed(2)}</s-text> · {lowest.owner}
            </s-text>
          )}
        </s-stack>

        {/* Action banner */}
        {actionItems.length > 0 && (
          <s-banner tone="warning">
            <s-stack direction="block" gap="extra-tight">
              {actionItems.map((a) => (
                <s-text key={a.label}>
                  <s-text type="strong">{a.count}</s-text> {a.label}
                </s-text>
              ))}
            </s-stack>
          </s-banner>
        )}

        {/* By-size table — one row per active listing, sorted by price asc */}
        {variants.length > 0 && (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header><s-text color="subdued">Size</s-text></s-table-header>
              <s-table-header><s-text color="subdued">Price</s-text></s-table-header>
              <s-table-header><s-text color="subdued">Owner</s-text></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {variants.flatMap((v) => {
                // Fallback for old metafields that don't have activePrices yet
                const prices = (v.activePrices && v.activePrices.length > 0)
                  ? v.activePrices
                  : (v.lowestPrice != null ? [{ price: v.lowestPrice, owner: v.lowestOwner ?? "—" }] : []);

                const rows = prices.map((p, i) => (
                  <s-table-row key={`${v.variantId}-${i}`}>
                    <s-table-cell>
                      {i === 0
                        ? <s-text type="strong">{v.size}</s-text>
                        : <s-text color="subdued"> </s-text>
                      }
                    </s-table-cell>
                    <s-table-cell>
                      <s-text type={i === 0 ? "strong" : undefined}>${p.price.toFixed(2)}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text color="subdued">{p.owner}</s-text>
                    </s-table-cell>
                  </s-table-row>
                ));

                if (v.needsPrice > 0) {
                  rows.push(
                    <s-table-row key={`${v.variantId}-needs-price`}>
                      <s-table-cell>
                        {prices.length === 0 ? <s-text type="strong">{v.size}</s-text> : <s-text color="subdued"> </s-text>}
                      </s-table-cell>
                      <s-table-cell>
                        <s-text color="subdued">awaiting price ({v.needsPrice})</s-text>
                      </s-table-cell>
                      <s-table-cell>
                        <s-text color="subdued">—</s-text>
                      </s-table-cell>
                    </s-table-row>,
                  );
                }

                return rows;
              })}
            </s-table-body>
          </s-table>
        )}
      </s-stack>
    </s-admin-block>
  );
}
