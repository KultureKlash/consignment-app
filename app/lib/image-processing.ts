/**
 * Product image processing utilities.
 * Currently: client-side Canvas resize + white square padding.
 * Future: AI-powered background removal, smart cropping, etc.
 */

/**
 * Process a product image: resize and center on a white square canvas.
 * Returns a base64 data URL (PNG lossless, 1200×1200).
 */
export function processProductImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Not an image"));

    const img = new Image();
    img.onload = () => {
      const SIZE = 1200;
      const PADDING = 0.05; // 5% padding on each side
      const usable = SIZE * (1 - PADDING * 2); // 720px usable area

      // Scale image to fit within usable area
      let { width, height } = img;
      const ratio = Math.min(usable / width, usable / height);
      const drawW = Math.round(width * ratio);
      const drawH = Math.round(height * ratio);

      // Center on white square
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(img, (SIZE - drawW) / 2, (SIZE - drawH) / 2, drawW, drawH);

      resolve(canvas.toDataURL("image/png"));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}
