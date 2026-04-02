import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";
import { inputStyle, handleFocus, handleBlurStyle } from "~/lib/admin/listing-ui";
import { Plus, Pencil, Trash2, Check, X, MapPin } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const sections = await prisma.storeSection.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return { sections };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "create") {
      const name = (formData.get("name") as string ?? "").trim();
      if (!name) throw new Error("Name is required");
      const maxOrder = await prisma.storeSection.aggregate({ _max: { sortOrder: true } });
      await prisma.storeSection.create({
        data: { name, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
      });
      return { success: true, intent };
    }
    if (intent === "rename") {
      const id = formData.get("id") as string;
      const name = (formData.get("name") as string ?? "").trim();
      if (!name) throw new Error("Name is required");
      await prisma.storeSection.update({ where: { id }, data: { name } });
      return { success: true, intent };
    }
    if (intent === "delete") {
      const id = formData.get("id") as string;
      const count = await prisma.product.count({ where: { sectionId: id } });
      if (count > 0) throw new Error(`Cannot delete — ${count} product${count !== 1 ? "s" : ""} assigned to this section`);
      await prisma.storeSection.delete({ where: { id } });
      return { success: true, intent };
    }
    throw new Error("Invalid intent");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error", intent };
  }
};

const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(227,227,227,0.6)",
  borderRadius: "12px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  overflow: "hidden",
};

export default function Sections() {
  const { sections } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const isSubmitting = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    const data = fetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.success) {
      if (data.intent === "create") { shopify.toast.show("Section added"); setNewName(""); }
      if (data.intent === "rename") { shopify.toast.show("Section renamed"); setEditingId(null); }
      if (data.intent === "delete") { shopify.toast.show("Section deleted"); setConfirmDelete(null); }
    }
  }, [fetcher.data, shopify]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    fetcher.submit({ intent: "create", name: newName.trim() }, { method: "POST" });
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    fetcher.submit({ intent: "rename", id, name: editName.trim() }, { method: "POST" });
  };

  const handleDelete = (id: string) => {
    fetcher.submit({ intent: "delete", id }, { method: "POST" });
    setConfirmDelete(null);
  };

  // Group sections: Racks vs Shoe Storage
  const racks = sections.filter((s) => s.name.startsWith("Rack "));
  const shoes = sections.filter((s) => /^[A-Z]\d+$/.test(s.name));
  const other = sections.filter((s) => !s.name.startsWith("Rack ") && !/^[A-Z]\d+$/.test(s.name));

  const renderSection = (section: typeof sections[0]) => {
    const isEditing = editingId === section.id;
    const count = (section as any)._count?.products ?? 0;

    return (
      <div
        key={section.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 20px",
          borderBottom: "1px solid rgba(227,227,227,0.3)",
          fontSize: "13px",
        }}
      >
        {isEditing ? (
          <>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(section.id); if (e.key === "Escape") setEditingId(null); }}
              onFocus={handleFocus}
              onBlur={handleBlurStyle}
              style={{ ...inputStyle, flex: 1, padding: "6px 10px", fontSize: "13px" }}
              autoFocus
            />
            <button onClick={() => handleRename(section.id)} disabled={isSubmitting} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#059669" }}>
              <Check size={14} />
            </button>
            <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#6d7175" }}>
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <MapPin size={13} color="#9ca3af" />
            <span style={{ flex: 1, fontWeight: 500, color: "#1a1a1a" }}>{section.name}</span>
            <span style={{ fontSize: "11px", color: "#9ca3af", minWidth: "60px" }}>
              {count > 0 ? `${count} product${count !== 1 ? "s" : ""}` : "—"}
            </span>
            <button
              onClick={() => { setEditingId(section.id); setEditName(section.name); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#9ca3af", transition: "color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#1a1a1a"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setConfirmDelete(section.id)}
              disabled={count > 0}
              style={{ background: "none", border: "none", cursor: count > 0 ? "default" : "pointer", padding: "4px", color: count > 0 ? "#e5e7eb" : "#9ca3af", transition: "color 0.15s" }}
              onMouseEnter={(e) => { if (count === 0) e.currentTarget.style.color = "#dc2626"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = count > 0 ? "#e5e7eb" : "#9ca3af"; }}
              title={count > 0 ? "Remove products first" : "Delete section"}
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <s-page heading="Store Sections">
      <s-section>
        <p style={{ fontSize: "13px", color: "#6d7175", marginBottom: "16px" }}>
          Manage where products are located in the store. Assign sections to products from the Listings page.
        </p>

        {/* Add new section */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            onFocus={handleFocus}
            onBlur={handleBlurStyle}
            placeholder="New section name (e.g. Rack G, K1)"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || isSubmitting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#fff",
              background: newName.trim() ? "#111827" : "#9ca3af",
              border: "none",
              borderRadius: "8px",
              cursor: newName.trim() ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {/* Clothing Racks */}
        {racks.length > 0 && (
          <div style={{ ...sectionCard, marginBottom: "16px" }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(227,227,227,0.5)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em" }}>Clothing Floor</span>
              <span style={{ fontSize: "11px", color: "#9ca3af" }}>{racks.length} rack{racks.length !== 1 ? "s" : ""}</span>
            </div>
            {racks.map(renderSection)}
          </div>
        )}

        {/* Shoe Storage */}
        {shoes.length > 0 && (
          <div style={{ ...sectionCard, marginBottom: "16px" }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(227,227,227,0.5)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em" }}>Shoe Storage</span>
              <span style={{ fontSize: "11px", color: "#9ca3af" }}>{shoes.length} shelves</span>
            </div>
            {shoes.map(renderSection)}
          </div>
        )}

        {/* Other */}
        {other.length > 0 && (
          <div style={sectionCard}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(227,227,227,0.5)" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em" }}>Other</span>
            </div>
            {other.map(renderSection)}
          </div>
        )}
      </s-section>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConfirmDelete(null)}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "360px", width: "90%", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "8px" }}>Delete Section?</h3>
            <p style={{ fontSize: "13px", color: "#6d7175", marginBottom: "16px" }}>This section will be permanently removed.</p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 500, borderRadius: "8px", border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
