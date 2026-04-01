/**
 * Seed: Shopify products + consignors + test listings + orders/payouts for testing.
 *
 * Usage:
 *   npx tsx prisma/seed-stress.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  // ── 1. Seed from Shopify CSV ──
  const csvPath = path.resolve(__dirname, "../shopify-export.csv");
  if (!fs.existsSync(csvPath)) { console.error("shopify-export.csv not found"); process.exit(1); }
  const rows: Record<string, string>[] = parse(fs.readFileSync(csvPath, "utf-8"), {
    columns: true, skip_empty_lines: true, relax_column_count: true,
  });

  // ── 2. Consignors from db-export.json ──
  const dbPath = path.resolve(__dirname, "../db-export.json");
  const dbExport = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, "utf-8")) : { consignors: [] };

  console.log("Seeding consignors...");
  const consignorMap = new Map<string, string>();
  const seenEmails = new Set<string>();
  for (const c of dbExport.consignors) {
    const email = c.email.toLowerCase();
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    const rec = await prisma.consignor.create({
      data: { name: c.name, email, phone: c.phone, taxStatus: c.taxStatus || "individual", province: c.province, storeOwned: c.storeOwned || false, feeRate: c.feeRate ?? 0.15, status: "active" },
    });
    consignorMap.set(email, rec.id);
  }
  console.log(`  ✓ ${consignorMap.size} consignors`);

  // ── 3. Products from CSV ──
  console.log("Seeding products...");
  const groups = new Map<string, Record<string, string>[]>();
  for (const r of rows) { const h = r["Handle"]; if (h) { groups.set(h, [...(groups.get(h) || []), r]); } }

  const productMap = new Map<string, string>();
  const variantIds: string[] = [];
  const usedStyleIds = new Set<string>();
  let pCnt = 0, vCnt = 0;

  for (const [, gr] of groups) {
    const pr = gr.find((r) => r["Title"]?.trim());
    if (!pr) continue;
    const title = pr["Title"].trim();
    if (pr["Status"]?.trim() !== "active" || productMap.has(title)) continue;

    const sku = pr["Variant SKU"]?.trim() || null;
    let styleId = sku ? extractStyleId(sku) : null;
    if (styleId && usedStyleIds.has(styleId)) styleId = null;
    if (styleId) usedStyleIds.add(styleId);

    const p = await prisma.product.create({
      data: { title, brand: pr["Vendor"]?.trim() || null, category: mapCat(pr["Product Category"]?.trim()), styleId, imageUrl: pr["Image Src"]?.trim() || null },
    });
    productMap.set(title, p.id);
    pCnt++;

    const seenSizes = new Set<string>();
    for (const r of gr) {
      const size = r["Option1 Value"]?.trim();
      if (!size || seenSizes.has(size)) continue;
      seenSizes.add(size);
      try {
        const v = await prisma.variant.create({ data: { productId: p.id, size, gtin: r["Variant SKU"]?.trim() || null } });
        variantIds.push(v.id);
        vCnt++;
      } catch { /* dup */ }
    }
  }
  console.log(`  ✓ ${pCnt} products, ${vCnt} variants`);

  // ── 4. Listings ──
  console.log("Seeding listings...");
  const consignorIds = [...consignorMap.values()];
  const listings: { id: string; cId: string; vId: string; price: number }[] = [];
  const n = Math.min(500, variantIds.length);
  for (let i = 0; i < n; i++) {
    const cId = consignorIds[i % consignorIds.length];
    const price = 100 + Math.round(Math.random() * 900);
    const l = await prisma.listing.create({ data: { consignorId: cId, variantId: variantIds[i], price, status: "active" } });
    listings.push({ id: l.id, cId, vId: variantIds[i], price });
  }
  console.log(`  ✓ ${listings.length} listings`);

  // ── 5. Orders + transactions ──
  console.log("Seeding orders...");
  let oCnt = 0, tCnt = 0;
  const usedListings = new Set<string>();

  for (let i = 0; i < 30; i++) {
    const daysAgo = Math.floor(Math.random() * 60);
    const date = new Date(Date.now() - daysAgo * 86400000);
    const itemCount = 1 + Math.floor(Math.random() * 3);
    const items: typeof listings[0][] = [];

    for (let j = 0; j < itemCount; j++) {
      // Pick an unused listing
      const available = listings.filter((l) => !usedListings.has(l.id));
      if (available.length === 0) break;
      const item = available[Math.floor(Math.random() * available.length)];
      items.push(item);
      usedListings.add(item.id);
    }
    if (items.length === 0) break;

    const total = items.reduce((s, it) => s + it.price, 0);
    const order = await prisma.order.create({
      data: { orderNumber: `#KK${3000 + i}`, total: Math.round(total * 1.14975 * 100) / 100, status: "closed", paymentStatus: "paid", createdAt: date },
    });
    oCnt++;

    for (const item of items) {
      await prisma.listing.update({ where: { id: item.id }, data: { status: "sold", soldAt: date } });
      const c = await prisma.consignor.findUnique({ where: { id: item.cId } });
      const fr = c?.feeRate ?? 0.15;
      const fee = Math.round(item.price * fr * 100) / 100;
      const ca = Math.round((item.price - fee) * 100) / 100;

      const oi = await prisma.orderItem.create({ data: { orderId: order.id, listingId: item.id, price: item.price, status: "sold" } });
      await prisma.transaction.create({
        data: { consignorId: item.cId, orderItemId: oi.id, type: "sale", salePrice: item.price, feeRate: fr, grossAmount: item.price, feeAmount: fee, consignorAmount: ca, amount: ca, createdAt: date },
      });
      tCnt++;
    }
  }
  console.log(`  ✓ ${oCnt} orders, ${tCnt} transactions`);

  // ── 6. Payouts ──
  console.log("Seeding payouts...");
  let poCnt = 0;
  for (const [, cId] of consignorMap) {
    const txs = await prisma.transaction.findMany({
      where: { consignorId: cId, type: "sale", payoutItems: { none: {} } },
      select: { id: true, consignorAmount: true },
      take: 5,
    });
    if (txs.length === 0) continue;

    const amt = Math.round(txs.reduce((s, t) => s + t.consignorAmount, 0) * 100) / 100;
    const statuses = ["pending", "invoiced", "paid"] as const;
    const status = statuses[poCnt % 3];

    await prisma.payout.create({
      data: {
        consignorId: cId, amount: amt, status,
        items: { create: txs.map((t) => ({ transactionId: t.id })) },
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000),
      },
    });
    poCnt++;
  }
  console.log(`  ✓ ${poCnt} payouts`);
  console.log("\nDone!");
}

function mapCat(c: string | null): string | null {
  if (!c) return null;
  const l = c.toLowerCase();
  if (l.includes("sneakers")) return "Sneakers";
  if (l.includes("boots")) return "Boots";
  if (l.includes("sandals") || l.includes("slides")) return "Slides";
  if (l.includes("shoes")) return "Sneakers";
  if (l.includes("t-shirt") || l.includes("tee")) return "T-Shirts";
  if (l.includes("hoodie") || l.includes("sweatshirt")) return "Hoodies";
  if (l.includes("jacket") || l.includes("coat") || l.includes("outerwear")) return "Jackets";
  if (l.includes("jeans")) return "Jeans";
  if (l.includes("short")) return "Shorts";
  if (l.includes("pant")) return "Pants";
  if (l.includes("shirt") || l.includes("clothing")) return "T-Shirts";
  if (l.includes("hat") || l.includes("cap")) return "Caps";
  if (l.includes("bag")) return "Bags";
  if (l.includes("wallet")) return "Wallets";
  const parts = c.split(" > ");
  return parts[parts.length - 1].trim();
}

function extractStyleId(sku: string): string | null {
  const parts = sku.split("-");
  if (parts.length < 2) return sku;
  const last = parts[parts.length - 1];
  if (/^\d+\.?\d*$/.test(last) || /^\d+[wWyY]?$/.test(last)) return parts.slice(0, -1).join("-");
  return sku;
}

main().catch((e) => { console.error("Seed failed:", e); process.exit(1); }).finally(() => prisma.$disconnect());
