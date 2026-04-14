import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { fmt } from "~/lib/currency";

export function InlinePrice({ listingId, price, editable }: { listingId: string; price: number; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(price.toFixed(2));
  const inputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher();
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  // Reset after successful save
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setEditing(false);
    }
  }, [fetcher.state, fetcher.data]);

  // Sync value when price changes from server
  useEffect(() => {
    if (!editing) setValue(price.toFixed(2));
  }, [price, editing]);

  if (!editable) {
    return <span className="font-medium tabular-nums">${fmt(price)}</span>;
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="font-medium tabular-nums cursor-pointer hover:text-[hsl(var(--cta))] transition-colors"
        title="Click to edit price"
      >
        ${fmt(price)}
      </button>
    );
  }

  const handleSubmit = () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) {
      setValue(price.toFixed(2));
      setEditing(false);
      return;
    }
    if (parsed === price) {
      setEditing(false);
      return;
    }
    fetcher.submit(
      { intent: "update-price", listingId, price: parsed.toFixed(2) },
      { method: "POST" },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") { setValue(price.toFixed(2)); setEditing(false); }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-muted-foreground text-xs">$</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        pattern="[0-9]*\.?[0-9]*"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSubmit}
        disabled={isSaving}
        className="w-20 bg-white/[0.08] border border-white/[0.15] rounded-md px-2 py-0.5 text-sm tabular-nums focus:border-[hsl(var(--cta))]/50 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--cta))]/30 transition-colors"
      />
      {isSaving && <span className="text-[10px] text-muted-foreground animate-pulse">...</span>}
    </div>
  );
}
