/**
 * Sunucu koduna istemciden yanlışlıkla erişilmesini derleme zamanında engeller ("server-only").
 * Telefon (APK) derlemesinde, kod cihazda çalıştığı için, next.config.ts bu dosyayı boş modüle yönlendirir.
 * Web derlemesinde koruma aynen geçerlidir.
 */
import "server-only";
