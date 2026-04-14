import type { ProductResult } from "~/lib/admin/listing-ui";

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
  styleId: string;
  title: string;
  brand: string;
  size: string;
  gtin: string;
  price: string;
  quantity: string;
  cost: string;
};

export const EMPTY_FORM: FormFields = {
  styleId: "",
  title: "",
  brand: "",
  size: "",
  gtin: "",
  price: "",
  quantity: "1",
  cost: "",
};

export type { ProductResult };
