```
             +----------------------+
             |      StockX API      |
             |  Product Catalog     |
             +----------+-----------+
                        |
                        v
             +----------------------+
             |   Catalog Import     |
             |      Service         |
             +----------+-----------+
                        |
                        v
             +----------------------+
             |     PostgreSQL       |
             |   SOURCE OF TRUTH    |
             |                      |
             | Products             |
             | Variants             |
             | Listings             |
             | Orders               |
             | Transactions         |
             | Payouts              |
             +----------+-----------+
                        |
                        v
             +----------------------+
             |   Shopify Sync       |
             | Product + Variant    |
             | Inventory Mirror     |
             +----------+-----------+
                        |
                        v
             +----------------------+
             |   Shopify Storefront |
             |      Customers       |
             +----------+-----------+
                        |
                        v
             +----------------------+
             | Shopify Webhooks     |
             | orders/create        |
             +----------+-----------+
                        |
                        v
             +----------------------+
             | Allocation Engine    |
             | FIFO / price logic   |
             +----------+-----------+
                        |
                        v
             +----------------------+
             | Ledger + Payouts     |
             | Consignor balances   |
             +----------+-----------+

    ADMIN ACCESS                    CONSIGNOR ACCESS
```

Shopify Admin                Marketplace Dashboard
|                              |
v                              v
Embedded Shopify App        Consignor Login
|                              |
v                              v
Admin Dashboard               Listings / Inventory
Consignors / Orders           Sales / Payouts
