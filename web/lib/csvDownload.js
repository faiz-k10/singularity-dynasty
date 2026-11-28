import { toCsv } from "@/lib/csv";

// A CSV file as a download response, built on request (the admin email-list download uses it; the product CSV exports were removed
// Nov 10 2026).
export function csvResponse({ filename, columns, rows }) {
  return new Response(toCsv(columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
