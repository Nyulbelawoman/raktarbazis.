# 🏭 RaktárBázis — karbantartó raktár (frontend-only demo)

Ez egy **lokálisan futó prototípus**: a teljes felület és logika a böngészőben él, a
„backend" egy kamu adatbázis (a `localStorage`-ban tárolódik). Nincs valódi szerver-oldali
logika, valódi email vagy scraping — ezek a következő fázisban jönnek. A cél most az volt,
hogy **a teljes munkafolyamat kipróbálható legyen** mindkét szerepben.

## Indítás

A legegyszerűbb (egy statikus fájlszerver, már elő van készítve):

```powershell
cd C:\Users\user\Downloads\raktar-app
node server.js
```

Majd nyisd meg: **http://localhost:8080**

Alternatíva: a `index.html`-t duplán kattintva is megnyithatod böngészőben
(`file://` módban is működik, a készlet a localStorage-ban marad).

## Demo belépés

A belépő képernyőn két nagy gomb van:

- **Munkásként** (Molnár Bence) — katalógus nézet, kosár, kivétel
- **Főnökként** (Nagy Gábor) — teljes admin

A lenyíló listából bármelyik felhasználót kiválaszthatod (6 főnök + 12 munkás).

## Mit tud a munkás

- **Webshop-szerű katalógus**: termékkép (emoji/fotó), pontos mennyiség, státusz
  (🟢 van / 🟡 rendelés alatt / 🔴 nincs), helyszín. **Nincs cikkszám, szállító, ár.**
- Kategóriák: ⚡ Villanyszerelő · 🔧 Gépész · 🧱 Kőműves · 📦 Egyéb
- Helyszínek: **Ernő utca / Kálvária tér**
- **Keresés szlenggel is**: `tediszár`, `wagó`, `gebó`, `szigszalag`, `flexi`, stb.
  (ékezet nélkül és ragozva is: `wagóból`, `kábelből`)
- Zöld **„➕ Kell"** gomb → kosár. A kosárban mennyiséget módosíthat, vagy
  **szabad szöveget** írhat be: `3 db wagó, 25 m mbcu 3x2,5, 1 db 16 amperes kismegszakító`
- **„Oké, kiveszem"** → hibajegyszám / munkaszám mező → **automatikus levonás** a készletből
- Ha a rendszer **bizonytalan** (pl. melyik 16A / melyik wagó), **képpel illusztrálva
  visszakérdez**.
- **Nincs raktáron** esetén „📩 Szólok a főnöknek" gomb → a főnök email fiókjába kerül.
- 📋 „Saját kivételeim" (a fejlécben) — csak a saját korábbi kivételeit látja.

## Mit tud a főnök (a felső sárga eszköztár)

- **🗂️ Admin**: minden elem listája (cikkszámmal, szállítóval), szerkesztés, új elem,
  kép feltöltés, törlés, „rendelés alatt" állítás.
- **💬 Chat**: `adj hozzá 150 m MBCu 3x2,5` · `vegyél el 13 db wagó 3-as` ·
  `állítsd be 0 db-ot a gebóra` · `mennyi van wagóból?` · `mi fogy?` · `rendelés alatt: fi relé`
- **🔔 Készlethiány**: minimum alatti tételek, **átlagfogyás alapú javasolt rendelés**
  (szállítási idő nélkül, „kicsivel több, mint ami fogy"). Szerszámoknál **csak 0-nál** jelez.
  „📧 Küldés a főnököknek" = a 48 órás ellenőrzés szimulálása.
- **📬 Email fiók**: szállítónként külön email (név + cikkszám + javasolt mennyiség).
  A tételeknél **pipa** → „megrendelve" (→ rendelés alatt státusz), pipa nélkül →
  a rendszer a **következő hónap 14-ig nem küld újra** arról a tételről.
- **📊 Havi rapport**: kivételek felhasználónként, hónaponként, + email küldés.
- **🧾 Audit napló**: minden készletváltozás (ki, mit, mikor).
- **📥 CSV import**: `név;cikkszám;kategória;egység;mennyiség;minimum` sorok beolvasása.

## Kamu adatbázis

- **112 tétel** (villany 39, gépész 39, kőműves 17, egyéb 17), 28 szerszám + 84 anyag.
- A katalógus a kutatás alapján készült: Wago 221/2273 sorozat, érvéghüvely + nyomófogó,
  kismegszakítók (B/C, 1P/3P), MBCu/H07V-U kábelek, **GEBO csőjavító bilincsek**,
  golyóscsap, perlátor, szimmering, fagyálló, PE csőhéj, glett/javítóhabarcs/fugázó,
  festékek, FFP2 maszk, stb.
- A szleng-szótár az aliasokban él (`tediszár`→teleszkópos nyél, `gebó`→GEBO bilincs, stb.).

## Adatok visszaállítása

A készlet a böngésző `localStorage`-jában van. Friss alapállapot:

```js
localStorage.removeItem('raktarbazis-db-v1');  // majd F5
```

## Következő fázis (még NEM kész)

- Valódi backend + adatbázis (PostgreSQL), jogosultságkezelés, bejelentkezés
- Valódi email küldés (SMTP) + cron a 48 órás ellenőrzéshez és a havi rapportra
- Partner-weboldalak scrapingje (név + cikkszám + méret), adapterenként, kézi fallbackkel
- Valódi termékfotók
- Telepíthető mobil (PWA)
