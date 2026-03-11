# Consignment Marketplace System Diagram

## High Level Architecture


                +--------------------+
                |      StockX API    |
                |  Product Catalog   |
                +---------+----------+
                          |
                          v
                +--------------------+
                |  Catalog Service   |
                |  (Our App)         |
                +---------+----------+
                          |
                          v
                +--------------------+
                |   PostgreSQL DB    |
                | Products           |
                | Variants           |
                | Listings           |
                | Orders             |
                | Ledger             |
                +---------+----------+
                          |
                          v
                +--------------------+
                | Shopify Storefront |
                |  Product Listings  |
                +---------+----------+
                          |
                          v
                +--------------------+
                |    Customers       |
                |  Purchase Items    |
                +---------+----------+
                          |
                          v
                +--------------------+
                | Shopify Webhooks   |
                |  Order Created     |
                +---------+----------+
                          |
                          v
                +--------------------+
                |  Listing Engine    |
                |  FIFO Allocation   |
                +---------+----------+
                          |
                          v
                +--------------------+
                | Ledger & Payouts   |
                | Consignor Balance  |
                +--------------------+
