# 🚀 Publikálás Vercel-re — lépésről lépésre

Ez az app egy **statikus webalkalmazás** (HTML + CSS + JavaScript + képek), ezért
**Vercel-re való feltöltése nagyon egyszerű** — nincs szükség szerverre vagy adatbázisra.
(A `server.js` csak a helyi fejlesztéshez kell, a Vercel nem használja.)

---

## Amit neked kell csinálnod (kb. 5 perc)

### 1. lépés — GitHub fiók + üres repository

1. Menj a **https://github.com** oldalra, és jelentkezz be (vagy regisztrálj — ingyenes).
2. Kattints a **„+"** (jobb felső) → **„New repository"**.
3. Név: `raktarbazis` (vagy amit szeretnél).
4. **Public** vagy **Private** — mindegy, a Vercel mindkettőt tudja.
5. **NE** pipáld be a „Add a README file"-t (mert már van).
6. **Create repository**.

### 2. lépés — a kód feltöltése

**A) Ha nekem adsz egy tokent** (lásd lent), akkor **én feltöltöm** — neked nem kell semmit csinálnod.

**B) Ha te töltöd fel:** a GitHub a repo létrehozása után mutat egy oldalt.
Ott válaszd a **„uploading an existing file"** linket, és **húzd be az egész `raktar-app` mappa tartalmát**
(vagy használd a git parancsokat — ezeket is megadom).

### 3. lépés — Vercel

1. Menj a **https://vercel.com** oldalra, és **jelentkezz be GitHub fiókkal** („Continue with GitHub").
2. **„Add New…" → „Project"**.
3. Válaszd ki a `raktarbazis` repository-t → **„Import"**.
4. Framework Preset: **Other** (minden alapbeállítás jó).
5. **„Deploy"** gomb.
6. Kb. 30 másodperc múlva kész — kapsz egy **nyilvános linket**, pl.
   `https://raktarbazis.vercel.app` — ezt bárhonnan eléred, telefonról is! 🎉

### 4. lépés (opcionális) — saját domain

A Vercel projekt beállításaiban: **Settings → Domains → Add** — ide írd be a saját domainedet,
és a Vercel megmutatja, milyen DNS-bejegyzést kell beállítanod a domain szolgáltatónál.

---

## Amit tőled kérek, hogy **én** tudjam feltölteni

Ha szeretnéd, hogy **én** intézzem a GitHub feltöltést (nem kell git-parancsokat gépelned):

1. Hozd létre az **üres repository-t** a GitHubon (1. lépés).
2. Készíts egy **Personal Access Token**-t:
   - GitHub → jobb felső kép → **Settings**
   - legalul **Developer settings** → **Personal access tokens** → **Tokens (classic)**
   - **Generate new token (classic)**
   - Név: `raktarbazis-deploy`, lejárat: pl. 30 nap
   - Jogosultság: pipáld be a **`repo`** jelölőt
   - **Generate token** → **másold ki a tokent** (egyszer látszik!)
3. Küldd el nekem: **a repository URL-jét** (pl. `https://github.com/felhasznalonev/raktarbazis`)
   és **a tokent**.

> ⚠️ **Biztonsági megjegyzés:** a token csak a te repóidhoz ad hozzáférést, és bármikor visszavonhatod
> (Settings → Developer settings → ugyanott „Delete"). Használat után **javaslom visszavonni**.

A Vercel-hez **nem kell tokent adnod** — azt böngészőből, pár kattintással te csinálod (3. lépés),
vagy ha akarod, adhatsz Vercel tokent is, és akkor azt is elintézem.

---

## Alternatíva: Vercel CLI (ha nekem adsz Vercel tokent)

1. Vercel → **Settings → Tokens → Create Token**.
2. Küldd el a tokent, és én lefuttatom a `vercel --prod` parancsot — **GitHub nélkül is** működik.

---

## Jelenlegi állapot

- Az app **100%-ban statikus** → Vercel ingyenes csomagja tökéletesen elég.
- A adatok (készlet, kosár) a **böngésző localStorage-ában** tárolódnak — minden felhasználónál külön.
  (Ez a demó működése; az éles, közös rendszerhez majd backend + adatbázis kell.)
