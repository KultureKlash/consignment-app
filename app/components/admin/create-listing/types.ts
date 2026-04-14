import type { ProductResult } from "~/components/admin/listings/listing-ui";

export type Consignor = {
  id: string;
  name: string;
  email: string;
  feeRate: number;
  storeOwned: boolean;
};

export type Props = {
  consignors: Consignor[];
  knownBrands: string[];
};

export type FormFields = {
  sku: string;
  title: string;
  brand: string;
  size: string;
  gtin: string;
  price: string;
  quantity: string;
  cost: string;
};

export const EMPTY_FORM: FormFields = {
  sku: "",
  title: "",
  brand: "",
  size: "",
  gtin: "",
  price: "",
  quantity: "1",
  cost: "",
};

export type { ProductResult };
