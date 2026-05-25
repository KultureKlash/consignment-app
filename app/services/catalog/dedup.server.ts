import type { Product, Variant } from "@prisma/client";
import prisma from "~/db.server";
import { LISTING_STATUS } from "~/lib/domain";
import { findProductByTitleAndBrand, searchProducts } from "./catalog.server";

// ── Public types ──

export type DuplicateCandidate = {
  id: string;
  title: string;
  brand: string | null;
  sku: string | null;
  activeVariantCount: number;
};

export type DuplicateMatch =
  | { kind: "gtin"; existing: { product: Product; variant: Variant } }
  | { kind: "exact-title"; existing: Product }
  | { kind: "similar"; candidates: DuplicateCandidate[] }
  | { kind: "none" };

/** Thrown by submission services when a duplicate is detected.
 *  Routes catch this and translate `match` into a typed JSON response so the UI
 *  can render the appropriate confirm/pick modal. */
export class DuplicateError extends Error {
  constructor(public readonly match: DuplicateMatch) {
    super("Duplicate product detected");
    this.name = "DuplicateError";
  }
}

// ── Tokenization / scoring helpers ──

const STOPWORDS = new Set(["a", "an", "the", "and", "of", "&", "for", "with"]);

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

function extractModelNumbers(words: string[]): string[] {
  return words.filter((w) => /^\d+$/.test(w));
}

/** Classic Wagner-Fischer DP edit distance. Used only on words ≥ 4 chars. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

/** True if `submitted` looks like an existing product to the human eye.
 *  - Short tokens (b30, aj1) must match exactly — Levenshtein on 3-char strings
 *    flips meaning too easily.
 *  - Long tokens tolerate 1 edit so typos like "cuntdown" still match.
 *  - If both sides have purely-numeric tokens (model numbers) and none overlap,
 *    the products are intentionally different (Air Jordan 1 vs Air Jordan 4). */
export function isSimilarTitle(submitted: string, existing: string): boolean {
  const sub = normalizeWords(submitted);
  const ex = normalizeWords(existing);
  if (sub.length === 0 || ex.length === 0) return false;

  const subNums = extractModelNumbers(sub);
  const exNums = extractModelNumbers(ex);
  if (subNums.length > 0 && exNums.length > 0) {
    const numOverlap = subNums.some((n) => exNums.includes(n));
    if (!numOverlap) return false;
  }

  let matches = 0;
  for (const sw of sub) {
    if (sw.length >= 4) {
      if (ex.some((ew) => levenshtein(sw, ew) <= 1)) matches++;
    } else if (ex.includes(sw)) {
      matches++;
    }
  }
  return matches / sub.length >= 0.5;
}

// ── Detection ──

async function findVariantByGtin(gtin: string) {
  return prisma.variant.findFirst({
    where: { gtin },
    include: { product: true },
  });
}

async function enrichCandidate(product: Product): Promise<DuplicateCandidate> {
  const activeVariantCount = await prisma.variant.count({
    where: {
      productId: product.id,
      listings: { some: { status: LISTING_STATUS.ACTIVE } },
    },
  });
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    sku: product.sku,
    activeVariantCount,
  };
}

/** Returns the strongest duplicate signal for a candidate submission, or `none`.
 *  Checks short-circuit in priority order: GTIN → exact title+brand → fuzzy. */
export async function detectDuplicateProduct({
  title,
  brand,
  gtin,
}: {
  title: string;
  brand?: string | null;
  sku?: string | null;
  gtin?: string | null;
}): Promise<DuplicateMatch> {
  const cleanGtin = gtin?.trim();
  if (cleanGtin) {
    const variant = await findVariantByGtin(cleanGtin);
    if (variant) {
      return { kind: "gtin", existing: { product: variant.product, variant } };
    }
  }

  const cleanTitle = title.trim();
  const exact = await findProductByTitleAndBrand(cleanTitle, brand ?? undefined);
  if (exact) return { kind: "exact-title", existing: exact };

  const wide = await searchProducts(cleanTitle);
  const filtered = wide.filter((p) => isSimilarTitle(cleanTitle, p.title));
  if (filtered.length > 0) {
    const candidates = await Promise.all(filtered.slice(0, 5).map(enrichCandidate));
    return { kind: "similar", candidates };
  }

  return { kind: "none" };
}
