/**
 * POST /share-target — normalde service worker yakalar (public/sw.js) ve buraya hiç düşmez.
 * Service worker devrede değilse (ilk açılış, kayıt başarısız) dosya sunucuya işlenmeden
 * kaybolmasın diye kullanıcıyı bilgilendirerek ana sayfaya yönlendirir. Dosya okunmaz/saklanmaz.
 */
export async function POST(request: Request) {
  return Response.redirect(new URL("/?paylasilan=sw", request.url), 303);
}
