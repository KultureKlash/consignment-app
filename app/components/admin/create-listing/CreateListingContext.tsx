import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { autoSuggest, buildCategory } from "~/lib/categories";
import { processProductImage } from "~/lib/image-processing";
import type { FormFields, ProductResult, Consignor } from "./types";
import { EMPTY_FORM } from "./types";

// ── Context value shape ──

interface CreateListingState {
  // Form fields
  formFields: FormFields;
  setFormFields: React.Dispatch<React.SetStateAction<FormFields>>;

  // Product selection
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
  selectedProduct: ProductResult | null;
  setSelectedProduct: (p: ProductResult | null) => void;
  productSearch: string;
  setProductSearch: (v: string) => void;
  showResults: boolean;
  setShowResults: (v: boolean) => void;
  searchResults: ProductResult[];
  isSearching: boolean;
  newProductMode: boolean;
  setNewProductMode: (v: boolean) => void;
  newSizeMode: boolean;
  setNewSizeMode: (v: boolean) => void;
  gtinLocked: boolean;
  setGtinLocked: (v: boolean) => void;

  // Category
  mainCategory: string;
  setMainCategory: (v: string) => void;
  subCategory: string;
  setSubCategory: (v: string) => void;
  setCategoryManual: (v: boolean) => void;
  isFootwearCat: boolean;

  // Taxonomy
  taxonomyInputRef: React.RefObject<HTMLDivElement | null>;
  taxonomyFetcher: ReturnType<typeof useFetcher<{ categories: Array<{ id: string; fullName: string }> }>>;
  shopifyCategory: { id: string; fullName: string } | null;
  setShopifyCategory: (v: { id: string; fullName: string } | null) => void;
  taxonomySearch: string;
  setTaxonomySearch: (v: string) => void;
  showTaxonomyResults: boolean;
  setShowTaxonomyResults: (v: boolean) => void;
  taxonomyEditMode: boolean;
  setTaxonomyEditMode: (v: boolean) => void;
  taxonomyResults: Array<{ id: string; fullName: string }>;

  // Image
  imagePreview: string | null;
  setImagePreview: (v: string | null) => void;
  imageBase64: string | null;
  setImageBase64: (v: string | null) => void;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  handleImageSelect: (file: File) => void;

  // Validation
  fieldErrors: Set<string>;
  clearError: (field: string) => void;

  // Consignor
  consignors: Consignor[];
  selectedConsignor: string;
  setSelectedConsignor: (id: string) => void;
  selectedConsignorObj: Consignor | undefined;
  consignorInputRef: React.RefObject<HTMLDivElement | null>;

  // Refs
  productInputRef: React.RefObject<HTMLDivElement | null>;

  // Actions
  resetAll: () => void;
  handleSubmit: () => void;
  isLoading: boolean;
  hasProduct: boolean;
  knownBrands: string[];

  // Duplicate-detection modal state
  duplicateMatch: import("~/services/catalog").DuplicateMatch | null;
  dismissDuplicateModal: () => void;
  submitUseExisting: (productId: string) => void;
  submitForceCreate: () => void;
}

const CreateListingCtx = createContext<CreateListingState | null>(null);

export function useCreateListing() {
  const ctx = useContext(CreateListingCtx);
  if (!ctx) throw new Error("useCreateListing must be used within CreateListingProvider");
  return ctx;
}

export function CreateListingProvider({
  consignors,
  knownBrands,
  children,
}: {
  consignors: Consignor[];
  knownBrands: string[];
  children: React.ReactNode;
}) {
  const fetcher = useFetcher();
  const productFetcher = useFetcher<{ products: ProductResult[] }>();
  const taxonomyFetcher = useFetcher<{ categories: Array<{ id: string; fullName: string }> }>();
  const shopify = useAppBridge();

  const consignorInputRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLDivElement>(null);
  const taxonomyInputRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [selectedConsignor, setSelectedConsignor] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const [gtinLocked, setGtinLocked] = useState(false);
  const [newSizeMode, setNewSizeMode] = useState(false);
  const [newProductMode, setNewProductMode] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [formFields, setFormFields] = useState<FormFields>({ ...EMPTY_FORM });
  const [mainCategory, setMainCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [categoryManual, setCategoryManual] = useState(false);
  const [shopifyCategory, setShopifyCategory] = useState<{ id: string; fullName: string } | null>(null);
  const [taxonomySearch, setTaxonomySearch] = useState("");
  const [showTaxonomyResults, setShowTaxonomyResults] = useState(false);
  const [taxonomyEditMode, setTaxonomyEditMode] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  const selectedConsignorObj = consignors.find((c) => c.id === selectedConsignor);
  const isFootwearCat = !mainCategory || mainCategory === "Footwear";
  const searchResults = productSearch.trim() ? (productFetcher.data?.products ?? []) : [];
  const isSearching = productSearch.trim() !== "" && productFetcher.state === "loading";
  const taxonomyResults = taxonomySearch.trim() ? (taxonomyFetcher.data?.categories ?? []) : [];
  const isLoading = ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";
  const hasProduct = !!selectedProductId || newProductMode;

  const clearError = (field: string) =>
    setFieldErrors((prev) => { const next = new Set(prev); next.delete(field); return next; });

  const handleImageSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) { shopify.toast.show("Image must be under 10MB"); return; }
    try {
      const processed = await processProductImage(file);
      setImagePreview(processed);
      setImageBase64(processed);
    } catch { shopify.toast.show("Failed to process image"); }
  }, [shopify]);

  const resetAll = () => {
    setSelectedProductId(null);
    setSelectedProduct(null);
    setGtinLocked(false);
    setNewSizeMode(false);
    setProductSearch("");
    setFormFields({ ...EMPTY_FORM });
    setMainCategory("");
    setSubCategory("");
    setCategoryManual(false);
    setShopifyCategory(null);
    setTaxonomySearch("");
    setTaxonomyEditMode(false);
    setImagePreview(null);
    setImageBase64(null);
    setFieldErrors(new Set());
    setNewProductMode(false);
  };

  // Auto-suggest brand + category from title
  useEffect(() => {
    if (!formFields.title || categoryManual) return;
    const suggestion = autoSuggest(formFields.title);
    if (!formFields.brand) {
      if (suggestion.brand) {
        setFormFields((prev) => ({ ...prev, brand: suggestion.brand! }));
      } else {
        const titleLower = formFields.title.toLowerCase();
        const match = [...knownBrands].sort((a, b) => b.length - a.length).find((b) => titleLower.includes(b.toLowerCase()));
        if (match) setFormFields((prev) => ({ ...prev, brand: match }));
      }
    }
    if (suggestion.mainCategory && !mainCategory) {
      setMainCategory(suggestion.mainCategory);
      if (suggestion.subCategory) setSubCategory(suggestion.subCategory);
      if ((suggestion.mainCategory === "Accessories" || suggestion.mainCategory === "Headwear") && !formFields.size) {
        setFormFields((prev) => ({ ...prev, size: "O/S" }));
      }
    }
  }, [formFields.title]);

  // Debounced product search
  useEffect(() => {
    if (!productSearch.trim()) return;
    const timer = setTimeout(() => { productFetcher.load(`/app/api/products?q=${encodeURIComponent(productSearch)}`); }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Debounced taxonomy search
  useEffect(() => {
    if (!taxonomySearch.trim()) return;
    const timer = setTimeout(() => { taxonomyFetcher.load(`/app/api/taxonomy?q=${encodeURIComponent(taxonomySearch)}`); }, 300);
    return () => clearTimeout(timer);
  }, [taxonomySearch]);

  // Handle action responses
  useEffect(() => {
    const data = fetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) { shopify.toast.show(data.error as string); return; }
    if ((data.intent as string) === "create") {
      shopify.toast.show(`${data.quantity ?? 1} listing(s) created`);
      resetAll();
      setSelectedConsignor("");
    }
  }, [fetcher.data, shopify]);

  const handleSubmit = () => {
    const errors = new Set<string>();
    if (!selectedConsignor) errors.add("consignorId");
    if (!formFields.title.trim()) errors.add("title");
    if (!formFields.size.trim()) errors.add("size");
    if (isFootwearCat && formFields.size.trim()) {
      const sizeNum = Number(formFields.size);
      if (isNaN(sizeNum) || sizeNum < 1 || sizeNum > 99 || (sizeNum % 1 !== 0 && sizeNum % 1 !== 0.5)) errors.add("size");
    }
    if (isFootwearCat && !formFields.gtin.trim()) errors.add("gtin");
    if (!formFields.setPriceLater) {
      const price = Number(formFields.price);
      if (isNaN(price) || price <= 0) errors.add("price");
    }

    if (errors.size > 0) { setFieldErrors(errors); shopify.toast.show("Please fill in all required fields"); return; }

    setFieldErrors(new Set());
    const category = mainCategory ? buildCategory(mainCategory, subCategory || undefined) : "";
    const submitData: Record<string, string> = {
      intent: "create",
      consignorId: selectedConsignor,
      sku: formFields.sku,
      title: formFields.title,
      brand: formFields.brand,
      size: formFields.size,
      gtin: formFields.gtin,
      quantity: formFields.quantity,
      cost: formFields.cost,
      category,
    };
    if (formFields.setPriceLater) {
      submitData.setPriceLater = "1";
    } else {
      submitData.price = formFields.price;
    }
    if (shopifyCategory) submitData.shopifyCategoryId = shopifyCategory.id;
    if (imageBase64) submitData.image = imageBase64;
    if (!formFields.cost) delete submitData.cost;
    // Admin selected an existing product from search — bypass dedup (we know it's intentional).
    if (selectedProductId && !newProductMode) submitData.useExistingProductId = selectedProductId;
    fetcher.submit(submitData, { method: "POST" });
  };

  // Re-submit with explicit dedup decision after the duplicate modal action.
  const submitWithDedupDecision = (decision: { useExistingProductId: string } | { forceCreate: true }) => {
    const category = mainCategory ? buildCategory(mainCategory, subCategory || undefined) : "";
    const submitData: Record<string, string> = {
      intent: "create",
      consignorId: selectedConsignor,
      sku: formFields.sku,
      title: formFields.title,
      brand: formFields.brand,
      size: formFields.size,
      gtin: formFields.gtin,
      quantity: formFields.quantity,
      cost: formFields.cost,
      category,
    };
    if (formFields.setPriceLater) submitData.setPriceLater = "1";
    else submitData.price = formFields.price;
    if (shopifyCategory) submitData.shopifyCategoryId = shopifyCategory.id;
    if (imageBase64) submitData.image = imageBase64;
    if (!formFields.cost) delete submitData.cost;
    if ("useExistingProductId" in decision) submitData.useExistingProductId = decision.useExistingProductId;
    if ("forceCreate" in decision) submitData.forceCreate = "1";
    fetcher.submit(submitData, { method: "POST" });
  };

  const fetcherData = fetcher.data as
    | { error?: string; duplicate?: import("~/services/catalog").DuplicateMatch }
    | undefined;
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);
  const duplicateMatch =
    fetcherData?.error === "duplicate-product" && !dismissedDuplicate
      ? fetcherData.duplicate ?? null
      : null;
  useEffect(() => {
    if (fetcherData?.error === "duplicate-product") setDismissedDuplicate(false);
  }, [fetcherData]);

  const submitUseExisting = (productId: string) => {
    setDismissedDuplicate(true);
    submitWithDedupDecision({ useExistingProductId: productId });
  };
  const submitForceCreate = () => {
    setDismissedDuplicate(true);
    submitWithDedupDecision({ forceCreate: true });
  };

  return (
    <CreateListingCtx.Provider value={{
      formFields, setFormFields,
      selectedProductId, setSelectedProductId, selectedProduct, setSelectedProduct,
      productSearch, setProductSearch, showResults, setShowResults,
      searchResults, isSearching, newProductMode, setNewProductMode,
      newSizeMode, setNewSizeMode, gtinLocked, setGtinLocked,
      mainCategory, setMainCategory, subCategory, setSubCategory, setCategoryManual, isFootwearCat,
      taxonomyInputRef, taxonomyFetcher, shopifyCategory, setShopifyCategory,
      taxonomySearch, setTaxonomySearch, showTaxonomyResults, setShowTaxonomyResults,
      taxonomyEditMode, setTaxonomyEditMode, taxonomyResults,
      imagePreview, setImagePreview, imageBase64, setImageBase64, imageInputRef, handleImageSelect,
      fieldErrors, clearError,
      consignors, selectedConsignor, setSelectedConsignor, selectedConsignorObj, consignorInputRef,
      productInputRef,
      resetAll, handleSubmit, isLoading, hasProduct, knownBrands,
      duplicateMatch,
      dismissDuplicateModal: () => setDismissedDuplicate(true),
      submitUseExisting,
      submitForceCreate,
    }}>
      {children}
    </CreateListingCtx.Provider>
  );
}
