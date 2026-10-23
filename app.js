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
  d.append(el("p", null, "Kucaj latinicom, bez kvačica. Na primer:"));
  const primeri = el("div", "primeri");
  for (const p of ["birac odbija sprej", "istekla licna karta", "glasanje van bm", "kontrolni list nije nadjen", "ispravka u zapisniku"]) {
    const b = el("button", null, p);
    b.type = "button";
    b.addEventListener("click", () => { upitPolje.value = p; prikazi(); upitPolje.focus(); });
    primeri.append(b);
  }
  d.append(primeri);
  return d;
}

function karticaRezultata(r) {
  const a = el("article", "rez");
  const z = el("div", "zaglavlje");
  const broj = el("div", "broj");
  broj.append(el("small", null, "STR."), document.createTextNode(String(r.strana)));
  z.append(broj, el("div", "poglavlje", r.poglavlje_kratko || kratkoPoglavlje(r.poglavlje)));
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

// ---- rečenice za mirno reagovanje
const recenicaBtn = $("recenice");
let recenice = [];
let recenicaOtvorene = false;

function prikaziRecenice() {
  const d = el("div", "recenice");
  d.append(el("p", "oznaka", "Interni materijal – nije iz priručnika"));
  const ol = el("ol");
  for (const r of recenice) {
    const li = el("li");
    li.append(el("p", "recenica", `„${r.tekst}“`));
    if (r.objasnjenje) li.append(el("p", "objasnjenje", r.objasnjenje));
    if (r.napomena) li.append(el("p", "objasnjenje", r.napomena));
    ol.append(li);
  }
  const zatvori = el("button", "zatvori", "Zatvori");
  zatvori.type = "button";
  zatvori.addEventListener("click", () => postaviRecenice(false));
  d.append(ol, zatvori);
  statusEl.textContent = "";
  rezultatiEl.replaceChildren(d);
  savetiEl.replaceChildren();
}

function postaviRecenice(otvori) {
  recenicaOtvorene = otvori;
  recenicaBtn.setAttribute("aria-expanded", String(otvori));
  if (otvori) {
    upitPolje.blur(); // da tastatura ne pokrije spisak
    prikaziRecenice();
    scrollTo({ top: 0 });
  } else {
    prikazi();
    upitPolje.focus();
  }
}
recenicaBtn.addEventListener("click", () => postaviRecenice(!recenicaOtvorene));

function prikazi() {
  if (!index) return;
  if (recenicaOtvorene) { prikaziRecenice(); return; }
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
  if (recenicaOtvorene) { recenicaOtvorene = false; recenicaBtn.setAttribute("aria-expanded", "false"); }
  tajmer = setTimeout(prikazi, ODLAGANJE);
});
upitPolje.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { upitPolje.value = ""; recenicaOtvorene = false; recenicaBtn.setAttribute("aria-expanded", "false"); prikazi(); }
  if (e.key === "Enter") { clearTimeout(tajmer); prikazi(); upitPolje.blur(); }
});

// ---- podaci
async function ucitaj() {
  const [prirucnik, saveti, rec] = await Promise.all([
    fetch("data/prirucnik.json").then((r) => r.json()),
    // dok nema odobrenih saveta, aplikacija radi samo sa priručnikom
    fetch("data/saveti.json").then((r) => (r.ok ? r.json() : { saveti: [] })).catch(() => ({ saveti: [] })),
    fetch("data/recenice.json").then((r) => (r.ok ? r.json() : { recenice: [] })).catch(() => ({ recenice: [] })),
  ]);
  index = buildIndex(prirucnik, saveti);
  recenice = rec.recenice ?? [];
  recenicaBtn.hidden = !recenice.length;
  const q = new URLSearchParams(location.search).get("q");
  if (q) upitPolje.value = q;
  if (new URLSearchParams(location.search).has("recenice") && recenice.length) { postaviRecenice(true); return; }
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
