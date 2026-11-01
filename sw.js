// Offline support: keep the app shell and all exercise pictures cached, refresh them in the background.
const CACHE = "trening-za-decu-v1";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "images/avion.svg",
  "images/bicikl.svg",
  "images/bocni-iskorak.svg",
  "images/bocni-plank.svg",
  "images/brza-stopala.svg",
  "images/cucanj-skok.svg",
  "images/cucanj.svg",
  "images/gusenica.svg",
  "images/iskorak-unazad.svg",
  "images/klizacki-skokovi.svg",
  "images/medvedje-puzanje.svg",
  "images/mekani-poskoci.svg",
  "images/most-jedna-noga.svg",
  "images/most.svg",
  "images/mrtva-buba.svg",
  "images/nova-vezba.svg",
  "images/odbrambeni-korak.svg",
  "images/pajacovi.svg",
  "images/penjac-brzo.svg",
  "images/penjac-polako.svg",
  "images/plank-dodir-ramena.svg",
  "images/plank.svg",
  "images/podizanje-na-prste.svg",
  "images/propadanja-stolica.svg",
  "images/rak-hodanje.svg",
  "images/sklekovi-kolena.svg",
  "images/sklekovi-stolica.svg",
  "images/sklekovi-zid.svg",
  "images/sklekovi.svg",
  "images/skok-sa-kolenima.svg",
  "images/skok-u-dalj.svg",
  "images/sprint.svg",
  "images/stajanje-jedna-noga.svg",
  "images/supermen.svg",
  "images/tihi-cucanj-skok.svg",
  "images/zabji-skokovi.svg",
  "images/zid-sed.svg",
  "images/zvezdasti-skokovi.svg"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request);
    const network = fetch(e.request).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    return cached || network;
  }));
});
