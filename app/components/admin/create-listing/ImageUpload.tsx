import { X, Camera } from "lucide-react";
import { inputStyle, handleFocus, handleBlurStyle } from "~/lib/admin/listing-ui";
import { fieldLabel } from "./helpers";
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
      style={{
        display: "grid",
        gridTemplateColumns: isFootwearCat ? "1fr 1fr" : "1fr",
        gap: "16px",
      }}
    >
      {isFootwearCat && (
        <div>
          <label style={fieldLabel}>
            Style ID{" "}
            <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
          </label>
          <input
            type="text"
            value={formFields.styleId}
            onChange={(e) => setFormFields({ ...formFields, styleId: e.target.value })}
            onFocus={handleFocus}
            onBlur={handleBlurStyle}
            placeholder="e.g. DD1391-100"
            style={inputStyle}
          />
          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
            Helps match products across listings
          </div>
        </div>
      )}
      <div>
        <label style={fieldLabel}>Photo</label>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageSelect(file);
            e.target.value = "";
          }}
        />
        {imagePreview ? (
          <div style={{ position: "relative", display: "inline-block" }}>
            <img
              src={imagePreview}
              alt="Product preview"
              style={{
                width: "100%",
                height: "80px",
                objectFit: "cover",
                borderRadius: "10px",
                border: "1px solid #e3e3e3",
              }}
            />
            <button
              type="button"
              onClick={() => {
                setImagePreview(null);
                setImageBase64(null);
              }}
              style={{
                position: "absolute",
                top: "-8px",
                right: "-8px",
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: "#1a1a1a",
                color: "#fff",
                border: "2px solid #fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
              }}
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
            style={{
              width: "100%",
              height: "80px",
              border: "2px dashed #d1d5db",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
              gap: "8px",
              background: "#fafafa",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#9ca3af";
              e.currentTarget.style.background = "#f5f5f5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#d1d5db";
              e.currentTarget.style.background = "#fafafa";
            }}
          >
            <Camera size={20} color="#9ca3af" />
            <span style={{ fontSize: "12px", color: "#6d7175", fontWeight: 500 }}>
              Upload photo
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
