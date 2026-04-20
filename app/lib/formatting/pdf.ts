import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { computeTax } from "~/lib/finance/tax";

interface StatementOptions {
  title: string;
  consignorName: string;
  period?: string;
  headers: string[];
  rows: string[][];
  totals?: { subtotal: number; consignor: { taxStatus: string; province?: string | null } };
}

/**
 * Generate a payout/sales statement PDF and trigger browser download.
 */
export function downloadStatement({
  title,
  consignorName,
  period,
  headers,
  rows,
  totals,
}: StatementOptions) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Kulture Klash", 14, 18);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(title, 14, 25);

  doc.setFontSize(10);
  doc.text(`Consignor: ${consignorName}`, 14, 32);
  if (period) doc.text(`Period: ${period}`, 14, 38);

  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  doc.text(`Generated: ${dateStr}`, doc.internal.pageSize.getWidth() - 14, 18, { align: "right" });

  // Table
  const startY = period ? 44 : 38;
  autoTable(doc, {
    startY,
    head: [headers],
    body: rows,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [17, 24, 39], textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: getColumnStyles(headers),
  });

  // Tax summary footer (if business consignor)
  if (totals) {
    const tax = computeTax(totals.subtotal, totals.consignor);
    const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 20;
    let y = finalY + 10;
    const rightX = doc.internal.pageSize.getWidth() - 14;

    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.setFont("helvetica", "normal");
    doc.text(`Subtotal:`, rightX - 50, y);
    doc.text(`$${fmt2(tax.subtotal)}`, rightX, y, { align: "right" });

    if (tax.isTaxable) {
      if (tax.gst > 0) {
        y += 6;
        doc.text(`GST (5%):`, rightX - 50, y);
        doc.text(`$${fmt2(tax.gst)}`, rightX, y, { align: "right" });
      }
      if (tax.qst > 0) {
        y += 6;
        doc.text(`QST (9.975%):`, rightX - 50, y);
        doc.text(`$${fmt2(tax.qst)}`, rightX, y, { align: "right" });
      }
      if (tax.hst > 0) {
        y += 6;
        doc.text(`${tax.taxLabel}:`, rightX - 50, y);
        doc.text(`$${fmt2(tax.hst)}`, rightX, y, { align: "right" });
      }
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text(`Total Payable:`, rightX - 50, y);
      doc.text(`$${fmt2(tax.total)}`, rightX, y, { align: "right" });
    }
  }

  // Download
  const filename = `${title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getColumnStyles(headers: string[]): Record<number, { halign?: "right" | "left" | "center" }> {
  const styles: Record<number, { halign?: "right" | "left" | "center" }> = {};
  headers.forEach((h, i) => {
    if (["Sale", "Fee", "Payout", "My Payout", "Price", "Total"].includes(h)) {
      styles[i] = { halign: "right" };
    }
  });
  return styles;
}