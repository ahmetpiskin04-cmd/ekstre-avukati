"use client";

/**
 * İstemcinin ekstre/analiz/sohbet çağrıları. Hangi motorun kullanılacağı DERLEME zamanında seçilir
 * (next.config.ts içindeki "@engine" takma adı):
 *  - web:    engine-remote.ts → kendi API rotalarımız (anahtar sunucuda)
 *  - telefon: engine-local.ts → aynı mantık cihazda (anahtar cihazda, sunucu yok)
 */
export { analyzeStatement, askStatement, uploadStatement } from "@engine";
