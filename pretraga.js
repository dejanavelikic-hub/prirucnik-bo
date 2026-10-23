// Pretraga priručnika za biračke odbore 2026. Bez zavisnosti, radi offline
// u pregledaču i u Node-u.
//
//   const index = buildIndex(prirucnik, { saveti: [] });
//   const { prirucnik: strane, saveti } = search(index, "birac odbija sprej");

const CIR_LAT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "d", е: "e", ж: "z", з: "z",
  и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o",
  п: "p", р: "r", с: "s", т: "t", ћ: "c", у: "u", ф: "f", х: "h", ц: "c",
  ч: "c", џ: "dz", ш: "s",
};
const BEZ_KVACICA = { č: "c", ć: "c", š: "s", ž: "z", đ: "d" };

const STOP = new Set([
  "da", "li", "je", "se", "kako", "sta", "sto", "ako", "koji", "koja", "koje",
  "kojem", "mora", "moraju", "treba", "sme", "smeju", "nije", "ne", "moze",
  "mogu", "biti", "bi", "su", "ce", "ima", "kada", "kad", "gde", "ili", "ali",
  "kod", "pri", "za", "na", "od", "do", "po", "iz", "sa", "uz", "to", "taj",
  "ta", "ono", "on", "ona", "oni", "ga", "mu", "njega", "njemu", "sve", "svi",
  "jos", "vec", "onda", "zasto", "cemu", "koliko", "neko", "nesto", "ko",
]);

// Samo za pretragu priručnika. Ključevi su već normalizovani ("nadjen" -> "naden").
const SINONIMI = {
  bm: "biracko mesto",
  bo: "biracki odbor",
  lk: "licna karta",
  lik: "lokalna izborna komisija",
  naden: "pronaden",
  visak: "veci",
  slikanje: "fotograf",
  kucno: "van birackog mesta",
  sporan: "vazeci nevazeci",
};

// Kratki nazivi poglavlja za prikaz uz rezultat, po rednom broju poglavlja.
export const KRATKA_POGLAVLJA = {
  1: "Nadležnost i sastav organa",
  2: "Primopredaja pre glasanja",
  3: "Priprema za glasanje",
  4: "Otvaranje BM",
  5: "Glasanje na BM",
  6: "Glasanje van BM",
  7: "Birači sa invaliditetom",
  8: "Red na BM",
  9: "Zatvaranje BM",
  10: "Utvrđivanje rezultata",
  11: "Primopredaja posle glasanja",
  12: "Krivična dela",
};

export function kratkoPoglavlje(naslov) {
  const broj = /^(\d+)\./.exec(naslov ?? "")?.[1];
  return KRATKA_POGLAVLJA[broj] ?? naslov ?? "";
}

const PRAG = 0.5;         // rezultat mora imati bar 50% ukupne težine upita
const BONUS_NASLOV = 0.3;  // koren u naslovu poglavlja
const BLIZINA = 8;         // koreni na <= 8 reči razmaka ...
const BONUS_BLIZINA = 0.5; // ... dobijaju 0.5 × zbir svojih težina
const MAX_REZULTATA = 3;
const DRUGI_SAVET = 0.75;  // drugi savet samo ako ima >= 75% skora prvog

export function normalize(tekst) {
  return String(tekst ?? "")
    .toLowerCase()
    .replace(/[а-яђјљњћџ]/g, (c) => CIR_LAT[c] ?? c)
    .replace(/[čćšžđ]/g, (c) => BEZ_KVACICA[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/dj/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function reci(tekst) {
  const n = normalize(tekst);
  return n ? n.split(" ") : [];
}

function koren(rec) {
  return rec.slice(0, Math.max(4, Math.min(5, rec.length - 1)));
}

const vazecaRec = (r) => (r.length >= 3 || r in SINONIMI) && !STOP.has(r);

// Upit -> lista pojmova; pojam je skup alternativnih korena.
// saSinonimima=false: originalne reči upita, uključujući "bm", "lk"...
function pojmoviUpita(upit, saSinonimima) {
  const pojmovi = [];
  for (const rec of reci(upit)) {
    if (!saSinonimima) {
      if (vazecaRec(rec)) pojmovi.push(new Set([koren(rec)]));
      continue;
    }
    const sin = SINONIMI[rec];
    if (sin && !sin.includes(" ")) {
      // jednoreči sinonim: pogađa se original ILI sinonim
      if (rec.length >= 3 && !STOP.has(rec)) pojmovi.push(new Set([koren(rec), koren(sin)]));
      else pojmovi.push(new Set([koren(sin)]));
      continue;
    }
    for (const r of sin ? sin.split(" ") : [rec]) {
      if (r.length < 3 || STOP.has(r)) continue;
      pojmovi.push(new Set([koren(r)]));
    }
  }
  // isti pojam dvaput u upitu ne nosi duplu težinu
  const vidjeno = new Set();
  return pojmovi.filter((p) => {
    const kljuc = [...p].sort().join("|");
    if (vidjeno.has(kljuc)) return false;
    vidjeno.add(kljuc);
    return true;
  });
}

// Sortiran rečnik: reč -> (dokument -> pozicije reči), sa pretragom po prefiksu.
function napraviKorpus(dokumenti, tekstDok) {
  const mapa = new Map();
  dokumenti.forEach((d, i) => {
    reci(tekstDok(d)).forEach((r, poz) => {
      if (!mapa.has(r)) mapa.set(r, new Map());
      const pojave = mapa.get(r);
      if (!pojave.has(i)) pojave.set(i, []);
      pojave.get(i).push(poz);
    });
  });
  const vokabular = [...mapa.keys()].sort();
  return { N: dokumenti.length, vokabular, mapa };
}

// Dokumenti u kojima neka reč počinje korenom pojma -> pozicije pogodaka.
function docsZaPojam(korpus, pojam) {
  const { vokabular, mapa } = korpus;
  const docs = new Map();
  for (const prefiks of pojam) {
    let lo = 0, hi = vokabular.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vokabular[mid] < prefiks) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < vokabular.length && vokabular[i].startsWith(prefiks); i++) {
      for (const [d, poz] of mapa.get(vokabular[i])) {
        if (!docs.has(d)) docs.set(d, []);
        docs.get(d).push(...poz);
      }
    }
  }
  for (const poz of docs.values()) poz.sort((a, b) => a - b);
  return docs;
}

const idf = (N, df) => Math.log(1 + N / df);

// Da li postoje pozicije iz a i b na razmaku <= BLIZINA (oba niza sortirana).
function blizu(a, b) {
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (Math.abs(a[i] - b[j]) <= BLIZINA) return true;
    if (a[i] < b[j]) i++;
    else j++;
  }
  return false;
}

// 0.5 × zbir težina pojmova koji imaju bar jedan drugi pojam u blizini.
function bonusBlizine(pojmovi, d) {
  const prisutni = pojmovi.filter((p) => p.docs.has(d));
  let zbir = 0;
  for (const p of prisutni) {
    const poz = p.docs.get(d);
    if (prisutni.some((q) => q !== p && blizu(poz, q.docs.get(d)))) zbir += p.tezina;
  }
  return BONUS_BLIZINA * zbir;
}

// U aplikaciji samo pregledani saveti: "odobreno" se postavlja ručno posle pregleda.
export function savetSePrikazuje(s) {
  return (s.status === "potvrdjeno" || s.status === "dopuna") && s.odobreno === true;
}

export function buildIndex(prirucnik, saveti = { saveti: [] }) {
  const pasusi = prirucnik.pasusi ?? prirucnik;
  const listaSaveta = (saveti?.saveti ?? []).filter(savetSePrikazuje);
  const naslovi = new Map();
  for (const p of pasusi) {
    if (!naslovi.has(p.poglavlje)) naslovi.set(p.poglavlje, reci(p.poglavlje));
  }
  return {
    pasusi,
    naslovi,
    korpus: napraviKorpus(pasusi, (p) => p.tekst),
    saveti: listaSaveta,
    korpusSaveta: napraviKorpus(listaSaveta, (s) => `${s.tema ?? ""} ${s.savet ?? ""}`),
    kljucneSaveta: listaSaveta.map((s) => reci((s.kljucne_reci ?? []).join(" "))),
  };
}

function pretraziPrirucnik(index, upit) {
  const { pasusi, naslovi, korpus } = index;
  const pojmovi = pojmoviUpita(upit, true)
    .map((pojam) => {
      const docs = docsZaPojam(korpus, pojam);
      return { pojam, docs, tezina: docs.size ? idf(korpus.N, docs.size) : 0 };
    })
    .filter((p) => p.tezina > 0); // reč koje nema u priručniku ne utiče na prag
  const ukupno = pojmovi.reduce((s, p) => s + p.tezina, 0);
  if (!ukupno) return [];

  const skor = new Map();
  // Samo za izjednačen skor: pojavljivanja u pasusu, težinski po IDF-u.
  const pogoci = new Map();
  for (const { docs, tezina } of pojmovi) {
    for (const [d, poz] of docs) {
      skor.set(d, (skor.get(d) ?? 0) + tezina);
      pogoci.set(d, (pogoci.get(d) ?? 0) + tezina * poz.length);
    }
  }

  const bolji = (a, b) => b.skor - a.skor || b.pogoci - a.pogoci || a.strana - b.strana;
  const najboljiPoStrani = new Map();
  for (const [d, osnovni] of skor) {
    if (osnovni < PRAG * ukupno) continue;
    const p = pasusi[d];
    const naslov = naslovi.get(p.poglavlje);
    let s = osnovni + bonusBlizine(pojmovi, d);
    for (const { pojam, tezina } of pojmovi) {
      if (naslov.some((r) => [...pojam].some((k) => r.startsWith(k)))) s += BONUS_NASLOV * tezina;
    }
    const kandidat = { ...p, poglavlje_kratko: kratkoPoglavlje(p.poglavlje), skor: s, pogoci: pogoci.get(d) };
    const pre = najboljiPoStrani.get(p.strana);
    if (!pre || bolji(kandidat, pre) < 0) najboljiPoStrani.set(p.strana, kandidat);
  }
  return [...najboljiPoStrani.values()].sort(bolji).slice(0, MAX_REZULTATA);
}

// Skor svakog saveta za jednu varijantu upita; null ako je ispod praga.
function skoroviSaveta(index, pojmoviBezTezine) {
  const { saveti, korpusSaveta, kljucneSaveta } = index;
  const pojmovi = pojmoviBezTezine
    .map((pojam) => {
      const docs = docsZaPojam(korpusSaveta, pojam);
      // ključne reči se računaju i kad ih nema u tekstu saveta
      kljucneSaveta.forEach((kr, i) => {
        if (kr.some((r) => [...pojam].some((k) => r.startsWith(k))) && !docs.has(i)) docs.set(i, []);
      });
      return { pojam, docs, tezina: docs.size ? idf(korpusSaveta.N, docs.size) : 0 };
    })
    .filter((p) => p.tezina > 0);
  const ukupno = pojmovi.reduce((s, p) => s + p.tezina, 0);
  return saveti.map((_, i) => {
    let osnovni = 0, s = 0, pogodjenaKljucna = false;
    for (const { pojam, docs, tezina } of pojmovi) {
      if (!docs.has(i)) continue;
      osnovni += tezina;
      const kljucna = kljucneSaveta[i].some((r) => [...pojam].some((k) => r.startsWith(k)));
      if (kljucna) pogodjenaKljucna = true;
      s += kljucna ? 2 * tezina : tezina;
    }
    // savet se prikazuje samo ako upit pogodi bar jednu njegovu ključnu reč
    return pogodjenaKljucna && osnovni >= PRAG * ukupno ? s : null;
  });
}

function pretraziSavete(index, upit) {
  const { saveti } = index;
  if (!saveti.length) return [];
  // Originalne reči upita i varijanta sa sinonimima; savet dobija bolji od dva skora.
  const original = skoroviSaveta(index, pojmoviUpita(upit, false));
  const sinonimi = skoroviSaveta(index, pojmoviUpita(upit, true));
  const rezultati = saveti
    .map((savet, i) => ({ ...savet, skor: Math.max(original[i] ?? -1, sinonimi[i] ?? -1) }))
    .filter((r) => r.skor >= 0)
    .sort((a, b) => b.skor - a.skor);
  if (!rezultati.length) return [];
  const [prvi, drugi] = rezultati;
  return drugi && drugi.skor >= DRUGI_SAVET * prvi.skor ? [prvi, drugi] : [prvi];
}

export function search(index, upit) {
  return {
    prirucnik: pretraziPrirucnik(index, upit),
    saveti: pretraziSavete(index, upit),
  };
}
