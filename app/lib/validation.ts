import { z } from "zod";

// ── Shared primitives ──

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Invalid email address");

const shortText = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(200, `${label} is too long`);

const optionalText = (maxLen = 200) =>
  z.string().trim().max(maxLen).optional().or(z.literal("")).transform((v) => v || undefined);

const price = z
  .string()
  .transform((v) => parseFloat(v))
  .refine((v) => !isNaN(v) && v > 0 && v <= 999999.99, "Price must be between $0.01 and $999,999.99")
  .transform((v) => Math.round(v * 100) / 100); // 2 decimal places

const optionalPrice = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? parseFloat(v) : undefined))
  .refine((v) => v === undefined || (!isNaN(v) && v >= 0 && v <= 999999.99), "Invalid cost value")
  .transform((v) => (v !== undefined ? Math.round(v * 100) / 100 : undefined));

// ── OTP Login ──

export const requestOtpSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Please enter your email address.").max(254),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  code: z
    .string()
    .trim()
    .length(6, "Code must be 6 digits")
    .regex(/^\d{6}$/, "Code must be 6 digits"),
});

// ── Consignor create/update ──

const taxFields = {
  taxStatus: z.enum(["individual", "business"]).optional(),
  gstNumber: z.string().max(20).optional().transform((v) => v || null),
  qstNumber: z.string().max(20).optional().transform((v) => v || null),
  province: z.string().max(5).optional().transform((v) => v || null),
};

export const createConsignorSchema = z.object({
  name: shortText("Name"),
  email,
  feeRate: z
    .string()
    .transform((v) => parseFloat(v))
    .refine((v) => !isNaN(v) && v >= 0 && v <= 100, "Fee rate must be between 0 and 100"),
  ...taxFields,
});

export const updateConsignorSchema = z.object({
  name: shortText("Name"),
  email,
  feeRate: z
    .string()
    .transform((v) => parseFloat(v))
    .refine((v) => !isNaN(v) && v >= 0 && v <= 100, "Fee rate must be between 0 and 100"),
  storeOwned: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  ...taxFields,
});

// ── Portal listing submission ──

export const submitListingSchema = z.object({
  title: shortText("Product name"),
  brand: optionalText(),
  mainCategory: optionalText(),
  subCategory: optionalText(),
  styleId: optionalText(100),
  size: shortText("Size").pipe(z.string().max(30, "Size is too long")),
  gtin: optionalText(50),
  price,
  quantity: z
    .string()
    .default("1")
    .transform((v) => parseInt(v) || 1)
    .refine((v) => v >= 1 && v <= 50, "Quantity must be 1-50"),
});

// ── Portal listing edit ──

export const portalEditListingSchema = z.object({
  size: shortText("Size").pipe(z.string().max(30, "Size is too long")),
  gtin: optionalText(50),
  price,
});

// ── Admin quick-add listing ──

export const quickAddListingSchema = z.object({
  title: shortText("Product name"),
  size: shortText("Size").pipe(z.string().max(30, "Size is too long")),
  price,
  consignorId: z.string().min(1, "Consignor is required"),
  brand: optionalText(),
  category: optionalText(),
  styleId: optionalText(100),
  gtin: optionalText(50),
  quantity: z
    .string()
    .default("1")
    .transform((v) => Math.max(1, Math.min(50, parseInt(v) || 1))),
  cost: optionalPrice,
});

// ── Admin edit product (product-level fields) ──

export const adminEditProductSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  title: optionalText(),
  brand: optionalText(),
  category: optionalText(),
  styleId: optionalText(100),
  imageData: optionalText(5_000_000),
});

// ── Admin edit listing (variant/listing-level fields only) ──

export const adminEditListingSchema = z.object({
  listingId: z.string().min(1, "Listing ID is required"),
  size: optionalText(30),
  gtin: optionalText(50),
  price: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? parseFloat(v) : undefined))
    .refine((v) => v === undefined || (!isNaN(v) && v > 0 && v <= 999999.99), "Invalid price"),
  cost: z
    .string()
    .nullable()
    .optional()
    .transform((v) => {
      if (v === null) return null;
      if (!v) return undefined;
      const n = parseFloat(v);
      return isNaN(n) ? undefined : Math.round(n * 100) / 100;
    }),
});

// ── Portal profile update ──

export const updateProfileSchema = z.object({
  name: shortText("Name"),
  phone: optionalText(30),
  taxStatus: z.enum(["individual", "business"]).default("individual"),
  province: optionalText(50),
  gstNumber: optionalText(20),
  qstNumber: optionalText(20),
});

// ── Rejection ──

export const rejectListingSchema = z.object({
  listingId: z.string().min(1, "Listing ID is required"),
  reason: shortText("Rejection reason").pipe(z.string().max(500, "Reason is too long")),
});

// ── Search query ──

export const searchQuerySchema = z.object({
  q: z.string().max(200, "Search query too long").default(""),
});

// ── Helper to parse FormData through a Zod schema ──

/**
 * Parse FormData through a Zod schema.
 * Throws a ValidationError (with `.message`) on failure — catch it in the route's try/catch.
 */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): z.infer<T> {
  const raw: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const firstError = result.error.errors?.[0]?.message
    ?? result.error.issues?.[0]?.message
    ?? "Invalid input";
  throw new Error(firstError);
}
