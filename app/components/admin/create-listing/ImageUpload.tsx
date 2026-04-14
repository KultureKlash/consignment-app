import { X, Camera } from "lucide-react";
import { useCreateListing } from "./CreateListingContext";

export default function ImageUpload() {
  const {
    isFootwearCat,
    formFields,
    setFormFields,
    imagePreview,
    setImagePreview,
    setImageBase64,
    imageInputRef,
    handleImageSelect,
  } = useCreateListing();

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: isFootwearCat ? "1fr 1fr" : "1fr" }}
    >
      {isFootwearCat && (
        <div>
          <label className="admin-field-label">
            SKU{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={formFields.sku}
            onChange={(e) => setFormFields({ ...formFields, sku: e.target.value })}
            placeholder="e.g. DD1391-100"
            className="admin-input"
          />
          <div className="text-[11px] text-gray-400 mt-1">
            Helps match products across listings
          </div>
        </div>
      )}
      <div>
        <label className="admin-field-label">Photo</label>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageSelect(file);
            e.target.value = "";
          }}
        />
        {imagePreview ? (
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Product preview"
              className="w-full h-20 object-cover rounded-[10px] border border-gray-200"
            />
            <button
              type="button"
              onClick={() => {
                setImagePreview(null);
                setImageBase64(null);
              }}
              className="absolute -top-2 -right-2 w-[22px] h-[22px] rounded-full bg-gray-900 text-white border-2 border-white cursor-pointer flex items-center justify-center p-0 shadow-md"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <div
            onClick={() => imageInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = "#4f46e5";
              e.currentTarget.style.background = "#f8f7ff";
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderColor = "#d1d5db";
              e.currentTarget.style.background = "#fafafa";
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = "#d1d5db";
              e.currentTarget.style.background = "#fafafa";
              const file = e.dataTransfer.files[0];
              if (file) handleImageSelect(file);
            }}
            className="w-full h-20 border-2 border-dashed border-gray-300 rounded-[10px] flex items-center justify-center cursor-pointer transition-all duration-200 gap-2 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
          >
            <Camera size={20} color="#9ca3af" />
            <span className="text-xs text-gray-500 font-medium">
              Upload photo
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
