// Offline support.
// The page itself is fetched from the network first, so a new version shows up on the first open;
// everything else comes from the cache and is refreshed in the background.
// Every release: python3 tools/release.py (bumps CACHE here and APP_VERSION in index.html).
const CACHE = "trening-za-decu-v7";
const SHELL = [
  "./",
  "index.html",
  "qr.js",
  "drive.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "fonts/inter-latin-wght-normal.woff2",
  "fonts/inter-latin-ext-wght-normal.woff2",
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
  "images/kruzenje-kukovima.svg",
  "images/kruzenje-rukama.svg",
  "images/marsiranje.svg",
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
  "images/zamasi-nogama.svg",
  "images/zid-sed.svg",
  "images/zvezdasti-skokovi.svg",
  "images/anim/avion.svg",
  "images/anim/bicikl.svg",
  "images/anim/bocni-iskorak.svg",
  "images/anim/bocni-plank.svg",
  "images/anim/brza-stopala.svg",
  "images/anim/cucanj-skok.svg",
  "images/anim/cucanj.svg",
  "images/anim/gusenica.svg",
  "images/anim/iskorak-unazad.svg",
  "images/anim/klizacki-skokovi.svg",
  "images/anim/kruzenje-kukovima.svg",
  "images/anim/kruzenje-rukama.svg",
  "images/anim/marsiranje.svg",
  "images/anim/medvedje-puzanje.svg",
  "images/anim/mekani-poskoci.svg",
  "images/anim/most-jedna-noga.svg",
  "images/anim/most.svg",
  "images/anim/mrtva-buba.svg",
  "images/anim/nova-vezba.svg",
  "images/anim/odbrambeni-korak.svg",
  "images/anim/pajacovi.svg",
  "images/anim/penjac-brzo.svg",
  "images/anim/penjac-polako.svg",
  "images/anim/plank-dodir-ramena.svg",
  "images/anim/plank.svg",
  "images/anim/podizanje-na-prste.svg",
  "images/anim/propadanja-stolica.svg",
  "images/anim/rak-hodanje.svg",
  "images/anim/sklekovi-kolena.svg",
  "images/anim/sklekovi-stolica.svg",
  "images/anim/sklekovi-zid.svg",
  "images/anim/sklekovi.svg",
  "images/anim/skok-sa-kolenima.svg",
  "images/anim/skok-u-dalj.svg",
  "images/anim/sprint.svg",
  "images/anim/stajanje-jedna-noga.svg",
  "images/anim/supermen.svg",
  "images/anim/tihi-cucanj-skok.svg",
  "images/anim/zabji-skokovi.svg",
  "images/anim/zamasi-nogama.svg",
  "images/anim/zid-sed.svg",
  "images/anim/zvezdasti-skokovi.svg"
];
// cache: "reload" skips the browser's own HTTP cache, so a new version really gets the new files
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // newest page from the network, but never wait more than 3 s (weak signal outside): then the saved copy opens
    // and the download finishes in the background for next time
    e.respondWith(caches.open(CACHE).then(async cache => {
      const saved = (await cache.match("index.html")) || (await cache.match("./"));
      const net = fetch(req, {cache: "no-cache"}).then(res => {
        if (res && res.ok) return cache.put("index.html", res.clone()).then(() => res);
        return res;
      });
      e.waitUntil(net.catch(() => {}));
      if (!saved) return net.catch(() => Response.error());
      const timeout = new Promise(r => setTimeout(() => r(null), 3000));
      const res = await Promise.race([net.catch(() => null), timeout]);
      return res || saved;
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req);
    const network = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || network;
  }));
});
