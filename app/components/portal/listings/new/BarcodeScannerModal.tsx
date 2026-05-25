import { useEffect, useRef, useState } from "react";
import { X, AlertCircle, ScanLine } from "lucide-react";

type Props = {
  onScan: (code: string) => void;
  onCancel: () => void;
};

/** Camera-based barcode scanner. Uses ZXing via dynamic import so the ~95KB
 *  library only loads when the user actually opens the scanner — keeps the
 *  initial portal bundle lean. Tries the back camera first (better for
 *  scanning), falls back to default device if not available. */
export function BarcodeScannerModal({ onScan, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // BrowserMultiFormatReader from @zxing/browser — typed loosely because the
  // dynamic import isn't typed at the call site. Tight type isn't worth the
  // import dance here.
  const readerRef = useRef<{ reset: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [zxingBrowser, zxingLibrary] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const { BrowserMultiFormatReader } = zxingBrowser;
        const { DecodeHintType, BarcodeFormat } = zxingLibrary;
        if (cancelled) return;

        // Hint ZXing about the formats we actually expect (EAN/UPC/Code128 cover
        // virtually every product barcode). Fewer formats per frame = faster
        // decode = phone can pick up the barcode from farther away.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader as unknown as { reset: () => void };

        const video = videoRef.current;
        if (!video) return;

        // Higher resolution = ZXing can read smaller (farther-away) barcodes.
        // Critical for iPhone: the main camera struggles to focus closer than
        // ~10cm. Requesting 1920×1080 means the user can hold the phone at a
        // comfortable distance (~20-30cm) and the barcode is still big enough
        // in the frame to decode. `focusMode: continuous` keeps autofocus on
        // while panning around.
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" }] as unknown as MediaTrackConstraintSet[],
          },
        };
        await reader.decodeFromConstraints(constraints, video, (result, err, controls) => {
          if (cancelled) {
            controls.stop();
            return;
          }
          if (result) {
            controls.stop();
            onScan(result.getText());
          }
          // err is fired continuously while scanning — only react to non-NotFound errors.
          // (NotFound is the normal "no barcode in this frame" signal.)
          if (err && err.name !== "NotFoundException" && err.name !== "NotFoundException2") {
            // Don't surface — just log; transient.
          }
        });
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // Common permission/availability errors → friendly message.
        if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
          setError("Camera permission denied. Enable camera access in your browser settings to scan.");
        } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("device")) {
          setError("No camera found on this device.");
        } else {
          setError(`Couldn't start scanner: ${msg}`);
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Reset the reader to release the camera stream.
      try { readerRef.current?.reset(); } catch { /* no-op */ }
    };
  }, [onScan]);

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel-popover rounded-2xl overflow-hidden w-full max-w-md flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Scan barcode</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-full hover:bg-white/[0.08] cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative aspect-square bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              Starting camera…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <AlertCircle className="w-8 h-8 text-amber-300 mb-2" />
              <p className="text-sm text-foreground/90">{error}</p>
            </div>
          )}
          {!loading && !error && (
            <>
              {/* Reticle overlay — visual guide for the scan target zone. */}
              <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-32 border-2 border-primary/60 rounded-xl" />
              <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-32 border-y-2 border-primary/30" />
            </>
          )}
        </div>

        <div className="px-4 py-3 text-[11px] text-muted-foreground border-t border-[rgba(255,255,255,0.08)]">
          Align the barcode inside the box. It'll auto-fill once detected.
        </div>
      </div>
    </div>
  );
}
