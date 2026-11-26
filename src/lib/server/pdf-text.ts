import "@/lib/server-guard";
import { extractTextItems, getDocumentProxy } from "unpdf";

/**
 * PDF metnini görsel satırlara çevirir.
 *
 * Banka ekstreleri tablo halindedir; pdf.js her sütunu ayrı parça verir ve
 * `extractText` bu parçaları boşluksuz yapıştırabilir ("15.08.2026MIGROS").
 * Burada parçaları y koordinatına göre satırlara gruplayıp x'e göre
 * sıralıyor, aralarına boşluk koyuyoruz.
 */
export async function extractPdfLines(data: Uint8Array): Promise<{ lines: string[]; pages: number }> {
  const pdf = await getDocumentProxy(data);
  const { totalPages, items } = await extractTextItems(pdf);
  const lines: string[] = [];

  for (const pageItems of items) {
    const parts = pageItems.filter((it) => it.str.trim() !== "");
    // PDF'te y aşağıdan yukarı artar: yukarıdan aşağı okumak için büyükten küçüğe.
    parts.sort((a, b) => b.y - a.y || a.x - b.x);

    const rows: { y: number; size: number; items: typeof parts }[] = [];
    for (const it of parts) {
      const size = it.fontSize || it.height || 10;
      const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(r.size, size) * 0.45);
      if (row) row.items.push(it);
      else rows.push({ y: it.y, size, items: [it] });
    }

    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let prevEnd: number | null = null;
      for (const it of row.items) {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          line += gap > row.size * 0.15 ? " " : "";
        }
        line += it.str;
        prevEnd = it.x + it.width;
      }
      const clean = line.replace(/\s+/g, " ").trim();
      if (clean) lines.push(clean);
    }
  }

  return { lines, pages: totalPages };
}
