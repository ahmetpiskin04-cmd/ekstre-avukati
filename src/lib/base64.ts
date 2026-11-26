/** Hem Node'da hem tarayıcıda/WebView'da çalışan base64 (Buffer'a bağımlı değil). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // String.fromCharCode argüman sınırını aşmamak için parça parça
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}
