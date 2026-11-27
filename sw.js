// Ponte Hub — Service Worker v2.0 (modo offline)
// Guarda o app (index.html), as bibliotecas externas e as fontes para abrir sem internet.
// Dados (Firestore) NÃO passam por aqui: o próprio Hub guarda uma cópia local (IndexedDB).
const VERSAO = "2.1.0";
const SHELL = "ponte-hub-shell-" + VERSAO;
const IMGS = "ponte-hub-img-v1";
const LIB = "ponte-hub-lib-v1";
const MAX_IMGS = 1500;

const SAME_ORIGIN = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/favicon.ico"];
const LIBS = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage-compat.js",
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@400;600;700&family=Orbitron:wght@500;900&display=swap"
];

async function precache() {
  const shell = await caches.open(SHELL);
  for (const u of SAME_ORIGIN) {
    try { const r = await fetch(u, { cache: "reload" }); if (r && r.ok) await shell.put(u === "/" ? "/index.html" : u, r); } catch (err) {}
  }
  const lib = await caches.open(LIB);
  for (const u of LIBS) {
    try { if (!(await lib.match(u))) { const r = await fetch(u); if (r && r.ok) await lib.put(u, r); } } catch (err) {}
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener("message", (e) => {
  if (e.data === "precache") e.waitUntil(precache());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && k !== IMGS && k !== LIB).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const comTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function paginaPrincipal(req) {
  const cache = await caches.open(SHELL);
  try {
    const r = await comTimeout(fetch(req), 6000);
    if (r && r.ok) cache.put("/index.html", r.clone());
    return r;
  } catch (err) {
    return (await cache.match("/index.html")) || Response.error();
  }
}

async function redePrimeiro(req) {
  const cache = await caches.open(SHELL);
  try {
    const r = await fetch(req);
    if (r && r.status === 200) cache.put(req, r.clone());
    return r;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || Response.error();
  }
}

async function cachePrimeiro(req, nome) {
  const cache = await caches.open(nome);
  const hit = await cache.match(req);
  if (hit) return hit;
  let r;
  try { r = await fetch(new Request(req.url, { mode: "cors", credentials: "omit" })); } catch (err) { r = await fetch(req); }
  if (r && r.ok) cache.put(req.url, r.clone());
  return r;
}

async function antigoEAtualiza(req, nome) {
  const cache = await caches.open(nome);
  const hit = await cache.match(req);
  const rede = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await rede) || Response.error();
}

async function aparar(cache) {
  const ks = await cache.keys();
  if (ks.length > MAX_IMGS) for (const k of ks.slice(0, ks.length - MAX_IMGS)) await cache.delete(k);
}

// Fotos: guarda só respostas com CORS (respostas "opacas" gastam ~7 MB de cota cada uma).
async function imagem(req) {
  const cache = await caches.open(IMGS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const r = await fetch(new Request(req.url, { mode: "cors", credentials: "omit" }));
    if (r && r.ok) { cache.put(req.url, r.clone()).then(() => aparar(cache)); return r; }
  } catch (err) {}
  try { return await fetch(req); } catch (err) { return Response.error(); }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  const h = url.hostname;
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  // Nunca intercepta banco de dados, upload, APIs e checagem de versão
  if (h === "firestore.googleapis.com" || h.endsWith("firebaseio.com") || h === "firebasestorage.googleapis.com" ||
      h === "identitytoolkit.googleapis.com" || h === "securetoken.googleapis.com" || h === "api.cloudinary.com" ||
      h === "raw.githubusercontent.com") return;
  if (h === self.location.hostname) {
    if (url.pathname.startsWith("/api/")) return;
    if (req.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
      if (url.pathname === "/" || url.pathname === "/index.html") { e.respondWith(paginaPrincipal(req)); }
      return;
    }
    e.respondWith(redePrimeiro(req));
    return;
  }
  if (h === "cdnjs.cloudflare.com" || h === "fonts.gstatic.com" || (h === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/"))) {
    e.respondWith(cachePrimeiro(req, LIB));
    return;
  }
  if (h === "fonts.googleapis.com") { e.respondWith(antigoEAtualiza(req, LIB)); return; }
  if (req.destination === "image") { e.respondWith(imagem(req)); return; }
});
