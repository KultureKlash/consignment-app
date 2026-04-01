/**
 * Escape a CSV cell value: wrap in quotes if it contains commas, quotes, or newlines.
 */
function escapeCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate a CSV string from headers and rows.
 * Prepends BOM for Excel compatibility.
 */
export function generateCsv(headers: string[], rows: string[][]): string {
  const bom = "\uFEFF";
  const headerLine = headers.map(escapeCell).join(",");
  const dataLines = rows.map((row) => row.map(escapeCell).join(","));
  return bom + [headerLine, ...dataLines].join("\n");
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
