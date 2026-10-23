// Service worker: sve se kešira pri instalaciji, posle radi i u avionskom režimu.
// VERZIJU menja scripts/napravi_app.mjs kad se promeni bilo koji fajl.
const VERZIJA = "51d5f1cb7957";
const KES = `prirucnik-${VERZIJA}`;
const FAJLOVI = [
  "./",
  "index.html",
  "app.js",
  "pretraga.js",
  "style.css",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "fonts/inter-latin.woff2",
  "fonts/inter-latin-ext.woff2",
  "fonts/inter-cyrillic.woff2",
  "data/prirucnik.json",
  "data/saveti.json",
  "data/recenice.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(KES)
      .then((c) => c.addAll(FAJLOVI.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((kljucevi) => Promise.all(
        kljucevi.filter((k) => k.startsWith("prirucnik-") && k !== KES).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)),
  );
});
