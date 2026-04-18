import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Plus, Pencil, Trash2, Check, X, MapPin } from "lucide-react";

type Section = {
  id: string;
  name: string;
  sortOrder: number;
  _count: { products: number };
};

interface SectionsPageProps {
  sections: Section[];
}

export function SectionsPage({ sections }: SectionsPageProps) {
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

  const renderSection = (section: Section) => {
    const isEditing = editingId === section.id;
    const count = section._count?.products ?? 0;

    return (
      <div
        key={section.id}
        className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-200/30 text-[13px]"
      >
        {isEditing ? (
          <>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(section.id); if (e.key === "Escape") setEditingId(null); }}
              className="admin-input flex-1 !py-1.5 !px-2.5 !text-[13px]"
              autoFocus
            />
            <button onClick={() => handleRename(section.id)} disabled={isSubmitting} className="bg-transparent border-0 cursor-pointer p-1 text-emerald-600">
              <Check size={14} />
            </button>
            <button onClick={() => setEditingId(null)} className="bg-transparent border-0 cursor-pointer p-1 text-gray-500">
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <MapPin size={13} color="#9ca3af" />
            <span className="flex-1 font-medium text-gray-900">{section.name}</span>
            <span className="text-[11px] text-gray-400 min-w-[60px]">
              {count > 0 ? `${count} product${count !== 1 ? "s" : ""}` : "\u2014"}
            </span>
            <button
              onClick={() => { setEditingId(section.id); setEditName(section.name); }}
              className="bg-transparent border-0 cursor-pointer p-1 text-gray-400 transition-colors duration-150 hover:text-gray-900"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setConfirmDelete(section.id)}
              disabled={count > 0}
              className={`bg-transparent border-0 p-1 transition-colors duration-150 ${
                count > 0
                  ? "text-gray-200 cursor-default"
                  : "text-gray-400 cursor-pointer hover:text-red-600"
              }`}
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
        <p className="text-[13px] text-gray-500 mb-4">
          Manage where products are located in the store. Assign sections to products from the Listings page.
        </p>

        {/* Add new section */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="New section name (e.g. Rack G, K1)"
            className="admin-input flex-1"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || isSubmitting}
            className={`admin-btn-primary flex items-center gap-1.5 !px-4.5 !py-2.5 !text-[13px] ${
              !newName.trim() ? "!bg-gray-400 !cursor-default hover:!bg-gray-400 hover:!shadow-none hover:!translate-y-0" : ""
            }`}
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {/* Clothing Racks */}
        {racks.length > 0 && (
          <div className="admin-card mb-4">
            <div className="px-5 py-3 border-b border-gray-200/50 flex items-center gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Clothing Floor</span>
              <span className="text-[11px] text-gray-400">{racks.length} rack{racks.length !== 1 ? "s" : ""}</span>
            </div>
            {racks.map(renderSection)}
          </div>
        )}

        {/* Shoe Storage */}
        {shoes.length > 0 && (
          <div className="admin-card mb-4">
            <div className="px-5 py-3 border-b border-gray-200/50 flex items-center gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Shoe Storage</span>
              <span className="text-[11px] text-gray-400">{shoes.length} shelves</span>
            </div>
            {shoes.map(renderSection)}
          </div>
        )}

        {/* Other */}
        {other.length > 0 && (
          <div className="admin-card">
            <div className="px-5 py-3 border-b border-gray-200/50">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Other</span>
            </div>
            {other.map(renderSection)}
          </div>
        )}
      </s-section>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl p-6 max-w-[360px] w-[90%] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold mb-2">Delete Section?</h3>
            <p className="text-[13px] text-gray-500 mb-4">This section will be permanently removed.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="admin-btn-secondary !px-4 !py-2 !text-[13px]">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="admin-btn-danger !px-4 !py-2 !text-[13px]">Delete</button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}
