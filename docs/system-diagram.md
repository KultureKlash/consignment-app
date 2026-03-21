# System Diagram

```
                        ADMIN (Shopify Store Owner)
                                  |
                                  v
                     +------------------------+
                     |     Shopify Admin      |
                     |   Apps > Consignment   |
                     +------------------------+
                                  |
                                  v
    +-------------------------------------------------------------+
    |                   EMBEDDED ADMIN PANEL                       |
    |                                                             |
    |  Home          Create Listing    Listings                   |
    |  (dashboard)   (form + search)   (filter/sort/group/page)   |
    |                                                             |
    |  Orders        Consignors                                   |
    |  (monitoring)  (fee rates + balances)                       |
    +-------------------------------------------------------------+
                                  |
                                  v
    +-------------------------------------------------------------+
    |                      SERVICES LAYER                          |
    |                                                             |
    |  catalog.server.ts          — Product/Variant find-or-create |
    |  listings.server.ts         — Create/cancel listings         |
    |  listing-queries.server.ts  — Search, filter, sort, paginate |
    |  orders.server.ts           — Process, cancel, refund orders |
    |  inventory.server.ts        — Shopify inventory sync         |
    |  shopify-products.server.ts — Shopify product/variant sync   |
    |  shopify-taxonomy.server.ts — Category taxonomy resolution   |
    |  webhooks.server.ts         — Idempotent webhook dispatch    |
    +-------------------------------------------------------------+
                                  |
                                  v
              +--------------------------------------+
              |         PostgreSQL / SQLite           |
              |         SOURCE OF TRUTH               |
              |                                      |
              |  Consignor  (fee rate: 10-20%)       |
              |  Product    (styleId, brand, image)   |
              |  Variant    (size, GTIN barcode)     |
              |  Listing    (per-item, no qty field) |
              |  Order      (payment status)         |
              |  OrderItem  (1:1 with listing)       |
              |  Transaction (audit snapshots)       |
              |  WebhookEvent (dedup)                |
              |  Payout                              |
              +--------------------------------------+
                                  |
                                  v
              +--------------------------------------+
              |        Shopify Sync Service          |
              |                                      |
              |  Product → Shopify Product           |
              |  Variant → Shopify Variant           |
              |  Price   → Lowest active listing     |
              |  Stock   → Count at lowest price     |
              +--------------------------------------+
                                  |
                                  v
              +--------------------------------------+
              |       Shopify Storefront             |
              |          Customers                   |
              +--------------------------------------+
                                  |
                                  v
              +--------------------------------------+
              |       Shopify Webhooks               |
              |                                      |
              |  orders/create    → processOrder     |
              |  orders/cancelled → cancelOrder      |
              |  refunds/create   → refundOrder      |
              +--------------------------------------+
                                  |
                                  v
              +--------------------------------------+
              |     Order Allocation Engine           |
              |                                      |
              |  1. Find active listings for variant  |
              |  2. Sort: price ASC, createdAt ASC   |
              |  3. Allocate 1 listing per item      |
              |  4. Mark listing pending_sale → sold  |
              |  5. Sync inventory to Shopify        |
              +--------------------------------------+
                                  |
                                  v
              +--------------------------------------+
              |     Financial Ledger                  |
              |                                      |
              |  Sale:   +consignorAmount            |
              |  Refund: -consignorAmount            |
              |                                      |
              |  Snapshot: salePrice, feeRate,       |
              |    grossAmount, feeAmount,           |
              |    consignorAmount                   |
              |                                      |
              |  Example (15% fee on $200 sale):     |
              |    feeAmount = $30                   |
              |    consignorAmount = $170            |
              +--------------------------------------+
                                  |
                                  v
              +--------------------------------------+
              |     Payout System                     |
              |                                      |
              |  Balance = SUM(transactions)          |
              |          - SUM(completed payouts)     |
              +--------------------------------------+


    ADMIN ACCESS                          CONSIGNOR ACCESS (future)
    |                                     |
    v                                     v
    Shopify Admin                         Marketplace Login
    |                                     |
    v                                     v
    Apps > Consignment App                Consignor Dashboard
    |                                     |
    v                                     v
    Admin Panel                           Listings / Inventory
      Home (dashboard)                    Sales / Earnings
      Create Listing                      Payouts / Barcode Scan
      Listings (search/filter/group)
      Orders
      Consignors


    FUTURE INTEGRATIONS
    |
    v
    +--------------------------------------+
    |        StockX API (planned)          |
    |                                      |
    |  Product catalog import              |
    |  Style ID lookup                     |
    |  Product images                      |
    |  Market price data                   |
    +--------------------------------------+
              |
              v
    +--------------------------------------+
    |     Barcode Scanner (planned)        |
    |                                      |
    |  Camera scanning (mobile)            |
    |  USB scanner support                 |
    |  GTIN → Variant auto-detection       |
    +--------------------------------------+
              |
              v
    +--------------------------------------+
    |     Notifications (planned)          |
    |                                      |
    |  Listing sold alerts                 |
    |  Payout processed alerts             |
    |  Low inventory warnings              |
    +--------------------------------------+
              |
              v
    +--------------------------------------+
    |     Analytics (planned)              |
    |                                      |
    |  Sales analytics                     |
    |  Product performance                 |
    |  Seller performance                  |
    |  Price history graphs                |
    +--------------------------------------+
```
