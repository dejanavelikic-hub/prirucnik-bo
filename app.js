import { buildIndex, search, kratkoPoglavlje } from "./pretraga.js";

const $ = (id) => document.getElementById(id);
const upitPolje = $("upit");
const statusEl = $("status");
const rezultatiEl = $("rezultati");
const savetiEl = $("saveti");
const pismoBtn = $("pismo");
const temaBtn = $("tema");

const ODLAGANJE = 150; // ms posle poslednjeg slova

// Podešavanja po uređaju; aplikacija radi i kad localStorage nije dostupan.
const zapamti = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const procitaj = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

let latinica = procitaj("pismo") === "lat";
let index = null;

// ---- tema
function primeniTemu(tema) {
  if (tema) document.documentElement.dataset.theme = tema;
  else delete document.documentElement.dataset.theme;
  const tamna = tema ? tema === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  temaBtn.textContent = tamna ? "Svetla tema" : "Tamna tema";
}
temaBtn.addEventListener("click", () => {
  const tamna = temaBtn.textContent === "Tamna tema";
  const nova = tamna ? "dark" : "light";
  zapamti("tema", nova);
  primeniTemu(nova);
  upitPolje.focus();
});
primeniTemu(procitaj("tema"));

// ---- pismo
function primeniPismo() {
  pismoBtn.setAttribute("aria-pressed", String(latinica));
  pismoBtn.textContent = latinica ? "Latinica ✓" : "Latinica";
}
pismoBtn.addEventListener("click", () => {
  latinica = !latinica;
  zapamti("pismo", latinica ? "lat" : "cir");
  primeniPismo();
  prikazi();
  upitPolje.focus();
});
primeniPismo();

// ---- prikaz
const el = (tag, klasa, tekst) => {
  const e = document.createElement(tag);
  if (klasa) e.className = klasa;
  if (tekst != null) e.textContent = tekst;
  return e;
};

function pomoc() {
  const d = el("div", "pomoc");
  d.append(el("p", null, "Kucaj latinicom, bez kvačica. Primeri:"));
  const ul = el("ul");
  for (const p of ["birac odbija sprej", "istekla licna karta", "glasanje van bm", "kontrolni list nije nadjen", "ispravka u zapisniku"]) {
    ul.append(el("li", null, p));
  }
  d.append(ul);
  return d;
}

function karticaRezultata(r) {
  const a = el("article", "rez");
  const z = el("div", "zaglavlje");
  const broj = el("div", "broj");
  broj.append(el("small", null, "STR."), document.createTextNode(String(r.strana)));
  z.append(broj, el("div", "poglavlje", `· ${r.poglavlje_kratko || kratkoPoglavlje(r.poglavlje)}`));
  const t = el("p", "tekst", latinica ? r.tekst_lat : r.tekst);
  t.lang = latinica ? "sr-Latn" : "sr-Cyrl";
  a.append(z, t);
  return a;
}

function karticaSaveta(s) {
  const a = el("aside", "savet");
  a.append(el("div", "oznaka", "Interni savet – nije iz priručnika"), el("p", null, s.savet));
  if (s.strana != null) a.append(el("p", "vezano", `Vezano za str. ${s.strana}`));
  return a;
}

function prikazi() {
  if (!index) return;
  const upit = upitPolje.value.trim();
  rezultatiEl.replaceChildren();
  savetiEl.replaceChildren();
  if (!upit) {
    statusEl.textContent = "";
    rezultatiEl.append(pomoc());
    return;
  }
  const { prirucnik, saveti } = search(index, upit);
  if (!prirucnik.length) {
    statusEl.textContent = "";
    rezultatiEl.append(el("p", "nista", "Nema rezultata u priručniku. Probaj drugu ili kraću reč."));
  } else {
    statusEl.textContent = "";
    rezultatiEl.append(...prirucnik.map(karticaRezultata));
  }
  savetiEl.append(...saveti.slice(0, 2).map(karticaSaveta));
}

let tajmer = 0;
upitPolje.addEventListener("input", () => {
  clearTimeout(tajmer);
  tajmer = setTimeout(prikazi, ODLAGANJE);
});
upitPolje.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { upitPolje.value = ""; prikazi(); }
  if (e.key === "Enter") { clearTimeout(tajmer); prikazi(); upitPolje.blur(); }
});

// ---- podaci
async function ucitaj() {
  const [prirucnik, saveti] = await Promise.all([
    fetch("data/prirucnik.json").then((r) => r.json()),
    // dok nema odobrenih saveta, aplikacija radi samo sa priručnikom
    fetch("data/saveti.json").then((r) => (r.ok ? r.json() : { saveti: [] })).catch(() => ({ saveti: [] })),
  ]);
  index = buildIndex(prirucnik, saveti);
  const q = new URLSearchParams(location.search).get("q");
  if (q) upitPolje.value = q;
  prikazi();
  upitPolje.focus();
}
ucitaj().catch(() => {
  statusEl.textContent = "Priručnik nije učitan. Otvori aplikaciju jednom dok imaš internet.";
});

// ---- rad bez interneta
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => {
    $("offline").textContent = "Spremno za rad bez interneta.";
  }).catch(() => {});
} else {
  $("offline").textContent = "Rad bez interneta nije dostupan na ovoj adresi.";
}
