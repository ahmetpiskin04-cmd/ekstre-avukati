/**
 * Telefondaki uygulamanın güncelleme sunucusu (ev ağındaki bilgisayar) adresi.
 * Güvenlik: yalnızca özel (ev/ofis) ağ IPv4 adresleri kabul edilir; böylece güncelleme isteği
 * internete çıkamaz. Aynı kural yerel kodda (Updater.java) da uygulanır — ikisi birbirini tutmalı.
 */

export const DEFAULT_UPDATE_PORT = 8765;

export interface UpdateAddress {
  host: string;
  port: number;
  /** http://192.168.1.23:8765 */
  base: string;
}

export function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  const [a, b] = o;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** "192.168.1.23", "192.168.1.23:9000", "http://192.168.1.23:8765/" → doğrulanmış adres; geçersizse null. */
export function parseUpdateAddress(input: string): UpdateAddress | null {
  const cleaned = input.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const m = cleaned.match(/^([\d.]+)(?::(\d{1,5}))?$/);
  if (!m) return null;
  const host = m[1];
  const port = m[2] ? Number(m[2]) : DEFAULT_UPDATE_PORT;
  if (!isPrivateIPv4(host) || port < 1 || port > 65535) return null;
  return { host, port, base: `http://${host}:${port}` };
}

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  size: number;
}

/** Yüklü sürümden yeni mi? (versionCode tam sayıdır ve her derlemede artar) */
export const isNewer = (info: Pick<UpdateInfo, "versionCode">, installedCode: number): boolean => info.versionCode > installedCode;

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
