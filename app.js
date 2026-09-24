/* =========================================================================
   RaktárBázis — alkalmazás logika (frontend-only demo)
   A "backend" itt a böngészőben fut: egy localStorage-ban tárolt kamu DB.
   ========================================================================= */

'use strict';

const STORE_KEY = 'raktarbazis-db-v1';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---------------- ADATBÁZIS ---------------- */
let DB = loadDB();
let currentUser = null;
let cart = [];            // [{ itemId, qty }]
let activeCat = 'all';
let activeLoc = 'all';
let currentSearch = '';
let activeView = 'catalog'; // catalog | history | panel-*
let ambigQueue = [];      // szabad szövegből fennmaradt bizonytalan tételek
let editingItemId = null;
let pendingAddId = null;

function loadDB() {
  let db = null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) db = JSON.parse(raw);
  } catch (e) { /* file:// korlátozás esetén memóriában dolgozunk */ }
  if (!db) db = seedDB();
  applyItemImages(db);
  return db;
}
function applyItemImages(db) {
  const BAD = ['images/fogo.png', 'images/izzo.png', 'images/henger.png'];
  for (const it of db.items) {
    if (BAD.includes(it.img)) it.img = null;
    if (typeof ITEM_IMAGES === 'object' && !it.img && ITEM_IMAGES[it.name]) it.img = ITEM_IMAGES[it.name];
  }
}
function seedDB() {
  const items = SEED_ITEMS.map((s, i) => ({
    id: 'it' + (i + 1),
    name: s.name,
    aliases: s.aliases || [],
    sku: s.sku || '',
    cat: s.cat,
    unit: s.unit || 'db',
    qty: s.qty || 0,
    min: s.min || 0,
    tool: !!s.tool,
    ordered: false,
    loc: s.loc || 'erno',
    sup: s.sup || '',
    emoji: s.emoji || '📦',
    img: null,
    avgWeekly: Math.max(1, Math.round((s.min || 4) * 0.25)),
    suppressUntil: null,
  }));
  return {
    items,
    txns: [],      // { id, userId, userName, itemId, itemName, qty, unit, workOrder, note, ts, type }
    emails: [],    // { id, to, subject, body, ts, kind, supplierId, itemIds, read, unsubscribed }
    audit: [],     // { id, ts, userId, userName, action, detail }
    settings: { recipients: ['gabor@ceg.hu', 'andrea@ceg.hu'] },
  };
}
function saveDB() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) {}
}

/* ---------------- SEGÉD ---------------- */
const DEACC = { 'á':'a','é':'e','í':'i','ó':'o','ö':'o','ő':'o','ú':'u','ü':'u','ű':'u','Á':'a','É':'e','Í':'i','Ó':'o','Ö':'o','Ő':'o','Ú':'u','Ü':'u','Ű':'u' };
function norm(s) {
  return String(s || '').toLowerCase().replace(/,/g, '.').split('').map(c => DEACC[c] || c).join('').replace(/\s+/g, ' ').trim();
}
function stem(w) {
  const suf = ['bol','bol','tol','tol','rol','rol','nal','nel','nak','nek','hoz','hez','hoz','ba','be','ban','ben','on','en','on','ra','re','val','vel','ert','ig','kent','ja','je','juk','juk','sag','seg'];
  for (const x of suf) { if (w.length > x.length + 2 && w.endsWith(x)) return w.slice(0, -x.length); }
  return w;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtQty(n) {
  if (n == null || isNaN(n)) return '0';
  return (Math.round(n * 100) / 100).toLocaleString('hu-HU', { maximumFractionDigits: 2 });
}
function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function nowISO() { return new Date().toISOString(); }
function supplierName(id) { const s = SUPPLIERS.find(x => x.id === id); return s ? s.name : '—'; }
function catLabel(c) { return ({ villany:'⚡ Villanyszerelő', gepesz:'🔧 Gépész', komuves:'🧱 Kőműves', egyeb:'📦 Egyéb' })[c] || c; }
function locLabel(l) { return l === 'erno' ? 'Ernő utca' : 'Kálvária tér'; }
function fmtTime(iso) { const d = new Date(iso); return d.toLocaleString('hu-HU', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); }

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function pushAudit(action, detail) {
  DB.audit.unshift({ id: uid(), ts: nowISO(), userId: currentUser?.id, userName: currentUser?.name || 'rendszer', action, detail });
  if (DB.audit.length > 500) DB.audit.length = 500;
  saveDB();
}

/* ---------------- KERESÉS (alias + fuzzy) ---------------- */
function searchItems(query, items, limit = 12) {
  const q = norm(query).trim();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const numTokens = tokens.filter(t => /^\d/.test(t));
  return items.map(it => {
    const hay = norm(it.name + ' ' + it.aliases.join(' ') + ' ' + it.sku);
    let score = 0;
    if (hay.includes(q)) score += 100;
    if (it.aliases.some(a => norm(a) === q)) score += 60;
    if (norm(it.name) === q) score += 80;
    if (norm(it.sku) === q) score += 90;
    let matched = 0;
    for (const t of tokens) {
      if (hay.includes(t)) matched++;
      else if (t.length >= 3 && hay.includes(stem(t))) matched += 0.8;
    }
    score += (matched / tokens.length) * 50;
    return { it, score, hay };
  }).filter(x => x.score >= 20 && numTokens.every(nt => x.hay.includes(nt)))
    .sort((a, b) => b.score - a.score).slice(0, limit);
}

function filterItems() {
  let items = DB.items.slice();
  if (typeof HIDDEN_ITEMS !== 'undefined') items = items.filter(i => !HIDDEN_ITEMS.includes(i.name));
  if (typeof LAST_ITEMS !== 'undefined') {
    const lastOnes = items.filter(i => LAST_ITEMS.includes(i.name));
    if (lastOnes.length) items = items.filter(i => !LAST_ITEMS.includes(i.name)).concat(lastOnes);
  }
  if (activeCat !== 'all') items = items.filter(i => i.cat === activeCat);
  if (activeLoc !== 'all') items = items.filter(i => i.loc === activeLoc);
  if (currentSearch.trim()) {
    const q = norm(currentSearch);
    const toks = q.split(/\s+/).filter(Boolean);
    items = items.filter(i => {
      const hay = norm(i.name + ' ' + i.aliases.join(' ') + ' ' + i.sku);
      return hay.includes(q) || toks.every(t => hay.includes(t) || (t.length >= 3 && hay.includes(stem(t))));
    });
  }
  return items;
}

/* ---------------- STÁTUSZ ---------------- */
function itemStatus(it) {
  if (it.qty > 0) return 'in';
  if (it.ordered) return 'order';
  return 'out';
}
function statusPill(it) {
  const s = itemStatus(it);
  if (s === 'in') return '<span class="status-pill status-in">🟢 Raktáron</span>';
  if (s === 'order') return '<span class="status-pill status-order">🟡 Rendelés alatt</span>';
  return '<span class="status-pill status-out">🔴 Nincs</span>';
}

/* ---------------- KATALÓGUS ---------------- */
function cardHTML(it) {
  const isBoss = currentUser && currentUser.role === 'boss';
  const alias = it.aliases.length ? it.aliases[0] : '';
  const img = it.img ? `<img src="${it.img}" alt="" />` : `<span>${it.emoji || '📦'}</span>`;
  const badge = it.tool ? '<span class="card-badge badge-tool">SZERSZÁM</span>' : '';
  const sizeBadge = (typeof SIZE_LABELS === 'object' && SIZE_LABELS[it.name]) ? `<span class="card-badge badge-size">${esc(SIZE_LABELS[it.name])}</span>` : '';
  const sku = isBoss && it.sku ? `<div class="card-sku"># ${esc(it.sku)}</div>` : '';
  const sup = isBoss && it.sup ? `<div class="card-loc">🏭 ${esc(supplierName(it.sup))}</div>` : '';

  let action = '';
  if (it.qty > 0) {
    action = `<button class="btn btn-green btn-block" data-add="${it.id}">➕ Kell</button>`;
  } else if (it.ordered) {
    action = `<button class="btn btn-block" disabled>🟡 Rendelés alatt</button>`;
  } else {
    action = `<button class="btn btn-warn btn-block" data-need="${it.id}">📩 Szólok a főnöknek</button>`;
  }
  const editBtn = isBoss ? `<button class="btn btn-ghost btn-block" data-edit="${it.id}">✏️ Szerkesztés</button>` : '';

  return `
  <div class="card" data-id="${it.id}">
    <div class="card-img">${badge}${sizeBadge}${img}</div>
    <div class="card-body">
      <div class="card-name">${esc(it.name)}</div>
      ${alias ? `<div class="card-alias">„${esc(alias)}"</div>` : ''}
      ${sku}
      <div class="card-stock">
        <span class="stock-qty">${fmtQty(it.qty)}</span>
        <span class="stock-unit">${it.unit}</span>
        ${statusPill(it)}
      </div>
      ${it.ordered && it.qty > 0 ? '<div class="card-alias">📦 + rendelés alatt</div>' : ''}
      <div class="card-loc">📍 ${locLabel(it.loc)}</div>
      ${sup}
    </div>
    <div class="card-actions">${action}${editBtn}</div>
  </div>`;
}

function renderCatalog() {
  const items = filterItems();
  $('#item-grid').innerHTML = items.map(cardHTML).join('');
  $('#result-count').textContent = items.length + ' tétel';
  $('#empty-state').classList.toggle('hidden', items.length > 0);
  const title = activeCat === 'all' ? 'Teljes katalógus' : catLabel(activeCat);
  $('#catalog-title').textContent = title + (activeLoc !== 'all' ? ' — ' + locLabel(activeLoc) : '');
}

/* ---------------- KOSÁR ---------------- */
function addToCart(itemId, qty = 1) {
  const it = DB.items.find(x => x.id === itemId);
  if (!it) return;
  const line = cart.find(c => c.itemId === itemId);
  if (line) line.qty += qty;
  else cart.push({ itemId, qty });
  renderCart();
  toast(`„${it.name}" a kosárban (${fmtQty(qty)} ${it.unit})`);
}

function openQtyModal(itemId) {
  const it = DB.items.find(x => x.id === itemId);
  if (!it) return;
  pendingAddId = itemId;
  $('#qty-thumb').innerHTML = it.img ? `<img src="${it.img}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>` : (it.emoji || '📦');
  $('#qty-name').textContent = it.name;
  $('#qty-stock').textContent = 'Raktáron: ' + fmtQty(it.qty) + ' ' + it.unit;
  $('#qty-unit').textContent = it.unit;
  const step = ['db','csomag','doboz','tekercs','pár'].includes(it.unit) ? 1 : 0.1;
  const inp = $('#qty-input');
  inp.value = '1';
  inp.step = String(step);
  inp.min = String(step);
  inp.dataset.step = String(step);
  $('#qty-modal').classList.remove('hidden');
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
}
function qtyAdjust(delta) {
  const inp = $('#qty-input');
  const step = parseFloat(inp.dataset.step || '1');
  let v = (parseFloat(inp.value) || 0) + delta * step;
  if (v < step) v = step;
  inp.value = Math.round(v * 100) / 100;
}
function persistCart() {
  try { localStorage.setItem('raktarbazis-cart', JSON.stringify(cart)); } catch (e) {}
}
function renderCart() {
  const wrap = $('#cart-items');
  const lines = cart.map(c => ({ c, it: DB.items.find(x => x.id === c.itemId) })).filter(x => x.it);
  wrap.innerHTML = lines.map(({ c, it }) => `
    <div class="cart-line">
      <span class="item-thumb">${it.img ? `<img src="${it.img}" style="width:40px;height:40px;object-fit:cover;border-radius:6px"/>` : (it.emoji || '📦')}</span>
      <div class="cart-line-info">
        <div class="cart-line-name">${esc(it.name)}</div>
        <div class="cart-line-sub">raktáron: ${fmtQty(it.qty)} ${it.unit}</div>
      </div>
      <div class="qty-ctrl">
        <button data-dec="${it.id}">−</button>
        <input type="number" step="0.1" min="0" value="${c.qty}" data-qty="${it.id}" />
        <button data-inc="${it.id}">+</button>
      </div>
      <button class="cart-line-del" data-del="${it.id}">🗑️</button>
    </div>`).join('');
  $('#cart-empty').classList.toggle('hidden', lines.length > 0);
  const total = lines.length;
  $('#cart-count').textContent = total;
  $('#checkout-btn').disabled = total === 0;
  $('#cart-summary').innerHTML = total ? `<b>${total}</b> különböző tétel a kosárban` : '';
  persistCart();
}
function setCartQty(itemId, qty) {
  const line = cart.find(c => c.itemId === itemId);
  if (!line) return;
  line.qty = Math.max(0, Number(qty) || 0);
  if (line.qty === 0) cart = cart.filter(c => c.itemId !== itemId);
  renderCart();
}

/* ---------------- SZABAD SZÖVEG (gyors beírás) ---------------- */
function parseSegment(seg) {
  seg = seg.trim().replace(/^egy\s+/i, '1 ');
  if (!seg) return null;
  // mértékegység-szóval: „25 méter mbcu", „13 db wagó"
  const unitKw = /^\s*(\d+(?:[.,]\d+)?)\s*(db|darab|m|méter|kg|l|liter|csomag|doboz|tekercs|pár)(?:-ot|-et|-t|-at)?\s*(.*)$/i;
  let m = seg.match(unitKw);
  if (m) return { qty: parseFloat(m[1].replace(',', '.')), term: m[3].replace(/^(a|az)\s+/i, '').trim() };
  // a szám a specifikáció része (16A, 16 amperes, 2,5mm, 3x2,5) -> a teljes szöveg a termék
  if (/^\s*\d+(?:[.,]\d+)?\s*(?:amper|mm|x|A\b)/i.test(seg)) return { qty: 1, term: seg };
  // egyébként a vezető szám a mennyiség
  m = seg.match(/^\s*(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (m) {
    const qty = parseFloat(m[1].replace(',', '.'));
    const rest = m[2].replace(/^(a|az)\s+/i, '').trim();
    return { qty, term: rest || seg };
  }
  return { qty: 1, term: seg.replace(/^(a|az)\s+/i, '').trim() };
}
function parseFreeText(text) {
  // védjük a magyar tizedesvesszőt (2,5 / 3x2,5) a lista-elválasztó vesszőtől
  text = text.replace(/(\d),(\d)/g, '$1.$2');
  const segs = text.split(/[,;\n]|(?: és | meg )/i).map(s => s.trim()).filter(Boolean);
  return segs.map(parseSegment).filter(Boolean);
}

function resolveAmbiguity() {
  if (!ambigQueue.length) return;
  const job = ambigQueue[0];
  const cands = job.candidates;
  if (cands.length === 1) {
    addToCart(cands[0].it.id, job.qty);
    ambigQueue.shift();
    resolveAmbiguity();
    return;
  }
  if (cands.length === 0) {
    toast(`Nem találtam ilyet: „${job.term}"`);
    ambigQueue.shift();
    resolveAmbiguity();
    return;
  }
  // mutassuk képpel
  $('#ambig-text').innerHTML = `A <b>„${esc(job.term)}"</b> (${fmtQty(job.qty)}) több termékre is illik. Kattints a megfelelőre:`;
  $('#ambig-grid').innerHTML = cands.map(x => `
    <div class="ambig-card" data-pick="${x.it.id}">
      <div class="card-img">${x.it.img ? `<img src="${x.it.img}" alt=""/>` : `<span>${x.it.emoji || '📦'}</span>`}</div>
      <div class="ambig-name">${esc(x.it.name)}</div>
      <div class="ambig-qty">📍 ${locLabel(x.it.loc)} · raktáron ${fmtQty(x.it.qty)} ${x.it.unit}</div>
    </div>`).join('');
  $('#ambig-modal').classList.remove('hidden');
}
function handleFreeText(text) {
  const parsed = parseFreeText(text);
  if (!parsed.length) { toast('Nem tudtam értelmezni, próbáld pl.: „3 db wagó, 25 m mbcu 3x2,5"'); return; }
  const jobs = parsed.map(p => ({ ...p, candidates: searchItems(p.term, DB.items, 5) }));
  const unambig = jobs.filter(j => j.candidates.length === 1);
  ambigQueue = jobs.filter(j => j.candidates.length !== 1);
  unambig.forEach(j => addToCart(j.candidates[0].it.id, j.qty));
  jobs.filter(j => j.candidates.length === 0).forEach(j => toast(`Nem találtam ilyet: „${j.term}"`));
  if (ambigQueue.length) resolveAmbiguity();
}

/* ---------------- KIVÉTEL / LEVONÁS ---------------- */
function openCheckout() {
  const lines = cart.map(c => ({ c, it: DB.items.find(x => x.id === c.itemId) })).filter(x => x.it);
  if (!lines.length) return;
  $('#checkout-list').innerHTML = lines.map(({ c, it }) => `
    <div class="checkout-line"><span>${esc(it.name)}</span><b>${fmtQty(c.qty)} ${it.unit}</b></div>`).join('');
  $('#workorder-input').value = '';
  $('#checkout-note').value = '';
  $('#checkout-modal').classList.remove('hidden');
}
function doCheckout() {
  const wo = $('#workorder-input').value.trim();
  if (!wo) { toast('Add meg a hibajegyszámot / munkaszámot!'); return; }
  const note = $('#checkout-note').value.trim();
  const lines = cart.map(c => ({ c, it: DB.items.find(x => x.id === c.itemId) })).filter(x => x.it);

  const insufficient = lines.filter(({ c, it }) => c.qty > it.qty);
  if (insufficient.length) {
    toast('Nincs elég készlet: ' + insufficient.map(x => x.it.name).join(', '));
    return;
  }
  lines.forEach(({ c, it }) => {
    it.qty = Math.round((it.qty - c.qty) * 100) / 100;
    DB.txns.unshift({ id: uid(), userId: currentUser.id, userName: currentUser.name, itemId: it.id, itemName: it.name, qty: c.qty, unit: it.unit, workOrder: wo, note, ts: nowISO(), type: 'out' });
    pushAudit('Kivétel', `${currentUser.name}: ${it.name} −${fmtQty(c.qty)} ${it.unit} (${wo})`);
  });
  cart = [];
  renderCart();
  saveDB();
  $('#checkout-modal').classList.add('hidden');
  closeDrawer();
  renderCatalog();
  toast('✅ Kivétel rögzítve, készlet frissítve.');
}

/* ---------------- SAJÁT ELŐZMÉNYEK ---------------- */
function renderHistory() {
  const rows = DB.txns.filter(t => t.type === 'out' && t.userId === currentUser.id);
  $('#history-table tbody').innerHTML = rows.map(t => `
    <tr><td>${fmtTime(t.ts)}</td><td>${esc(t.itemName)}</td><td>${fmtQty(t.qty)} ${t.unit}</td><td>${esc(t.workOrder)}</td></tr>`).join('')
    || '<tr><td colspan="4" class="muted">Még nincs rögzített kivételed.</td></tr>';
}

/* ---------------- FŐNÖK: ADMIN ---------------- */
function renderAdmin() {
  $('#panel-admin').innerHTML = `
    <h2>🗂️ Elemek kezelése</h2>
    <div class="panel-toolbar">
      <input type="search" id="admin-search" placeholder="Keresés az elemek között…" style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
      <button class="btn btn-green" id="admin-new">➕ Új elem</button>
    </div>
    <div class="table-wrap">
      <table class="data-table" id="admin-table">
        <thead><tr><th>Termék</th><th>Cikkszám</th><th>Kat.</th><th>Hely</th><th>Készlet</th><th>Min.</th><th>Szállító</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>`;
  $('#admin-search').addEventListener('input', () => renderAdminTable($('#admin-search').value));
  $('#admin-new').addEventListener('click', () => openItemModal(null));
  renderAdminTable('');
}
function renderAdminTable(q) {
  const nq = norm(q);
  const items = DB.items.filter(i => (typeof HIDDEN_ITEMS === 'undefined' || !HIDDEN_ITEMS.includes(i.name)) && (!nq || norm(i.name + ' ' + i.sku + ' ' + i.aliases.join(' ')).includes(nq)));
  $('#admin-table tbody').innerHTML = items.map(it => `
    <tr>
      <td>${it.img ? '<img src="'+it.img+'" style="width:26px;height:26px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:6px"/>' : '<span style="margin-right:6px">'+it.emoji+'</span>'}${esc(it.name)}</td>
      <td>${esc(it.sku || '—')}</td>
      <td>${catLabel(it.cat)}</td>
      <td>${locLabel(it.loc)}</td>
      <td><b>${fmtQty(it.qty)}</b> ${it.unit}</td>
      <td>${fmtQty(it.min)}</td>
      <td>${esc(supplierName(it.sup))}</td>
      <td><div class="row-actions"><button class="mini-btn" data-edit="${it.id}">✏️</button></div></td>
    </tr>`).join('') || '<tr><td colspan="8" class="muted">Nincs találat.</td></tr>';
}

/* ---------------- FŐNÖK: ELEM SZERKESZTÉS ---------------- */
function openItemModal(itemId) {
  editingItemId = itemId;
  const it = itemId ? DB.items.find(x => x.id === itemId) : null;
  $('#item-modal-title').textContent = it ? 'Elem szerkesztése' : 'Új elem';
  $('#f-name').value = it ? it.name : '';
  $('#f-sku').value = it ? it.sku : '';
  $('#f-aliases').value = it ? it.aliases.join(', ') : '';
  $('#f-category').value = it ? it.cat : 'egyeb';
  $('#f-unit').value = it ? it.unit : 'db';
  $('#f-qty').value = it ? it.qty : 0;
  $('#f-min').value = it ? it.min : 0;
  $('#f-location').value = it ? it.loc : 'erno';
  $('#f-isTool').checked = it ? it.tool : false;
  $('#f-ordered').checked = it ? it.ordered : false;
  $('#f-supplier').innerHTML = '<option value="">— nincs —</option>' + SUPPLIERS.map(s => `<option value="${s.id}" ${it && it.sup === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const preview = $('#f-thumb-preview');
  preview.dataset.img = it && it.img ? it.img : '';
  preview.innerHTML = it && it.img ? `<img src="${it.img}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>` : (it ? it.emoji : '📦');
  $('#item-delete').style.display = it ? 'inline-block' : 'none';
  $('#item-modal').classList.remove('hidden');
}
function saveItem() {
  const name = $('#f-name').value.trim();
  if (!name) { toast('A név kötelező!'); return; }
  const qty = Number($('#f-qty').value) || 0;
  const img = $('#f-thumb-preview').dataset.img || null;
  const data = {
    name,
    sku: $('#f-sku').value.trim(),
    aliases: $('#f-aliases').value.split(',').map(s => s.trim()).filter(Boolean),
    cat: $('#f-category').value,
    unit: $('#f-unit').value,
    qty,
    min: Number($('#f-min').value) || 0,
    loc: $('#f-location').value,
    tool: $('#f-isTool').checked,
    ordered: $('#f-ordered').checked,
    sup: $('#f-supplier').value,
    img,
  };
  if (editingItemId) {
    const it = DB.items.find(x => x.id === editingItemId);
    Object.assign(it, data);
    pushAudit('Elem módosítás', `${currentUser.name}: ${name}`);
  } else {
    DB.items.unshift({ id: uid(), emoji: '📦', avgWeekly: Math.max(1, Math.round(data.min * 0.25)), suppressUntil: null, ...data });
    pushAudit('Új elem', `${currentUser.name}: ${name}`);
  }
  saveDB();
  $('#item-modal').classList.add('hidden');
  renderCatalog(); if (activeView === 'panel-admin') renderAdmin();
  toast('💾 Mentve.');
}
function deleteItem() {
  if (!editingItemId) return;
  const it = DB.items.find(x => x.id === editingItemId);
  if (!it) return;
  if (!confirm(`Biztosan törlöd: „${it.name}"?`)) return;
  DB.items = DB.items.filter(x => x.id !== editingItemId);
  pushAudit('Elem törlés', `${currentUser.name}: ${it.name}`);
  saveDB();
  $('#item-modal').classList.add('hidden');
  renderCatalog(); renderAdmin();
  toast('🗑️ Törölve.');
}

/* ---------------- FŐNÖK: CHAT ---------------- */
const CHAT_HINTS = `Próbáld ki:
• „adj hozzá 150 m MBCu 3x2,5"
• „vegyél el 13 db wagó 3-as"
• „állítsd be 0 db-ot a gebóra"
• „mennyi van wagóból?"
• „mi fogy / mi hiányzik?"
• „rendelés alatt: fi relé"`;
function chatBotReply(text) {
  const t = text.trim();
  if (!t) return null;
  const lower = norm(t);

  if (/mi fogy|mi hianyzik|keszlethiany|alacsony keszlet|mit kell rendelni/.test(lower)) {
    const low = lowStockItems();
    if (!low.length) return 'Jelenleg nincs alacsony készletű tétel. 🎉';
    return 'Alacsony készlet:\n' + low.map(i => `• ${i.name} — ${fmtQty(i.qty)} ${i.unit} (min: ${fmtQty(i.min)})`).join('\n');
  }
  if (/^help|^sugo|^segitseg|^mit tudsz/.test(lower)) return CHAT_HINTS;

  const isMarkOrder = /rendeles alatt|megrendelve/.test(lower);

  let rest = lower.replace(/^(adj hozza|vegyel fel|bevetelez|erkezett|vegyel el|vegy el|vonj le|levon|allitsd be|allits|legyen|\bset\b|mennyi van|mutasd|keszlet|mennyi|rendeles alatt|megrendelve)\s*[:]?\s*/i, '');
  const unitQty = rest.match(/^\s*(\d+(?:[.,]\d+)?)\s*(db|darab|m|meter|kg|l|liter|csomag|doboz|tekercs|par)(?:-ot|-et|-t|-at)?\s*/i);
  let qty = 1, term = rest;
  if (unitQty) { qty = parseFloat(unitQty[1].replace(',', '.')); term = rest.slice(unitQty[0].length); }
  term = term.replace(/^(a|az|egy)\s+/i, '').trim();

  if (isMarkOrder) {
    const res = searchItems(term, DB.items, 1)[0];
    if (!res) return `Nem találtam: „${term}".`;
    res.it.ordered = true; res.it.suppressUntil = null; saveDB();
    pushAudit('Rendelés alatt', `${currentUser.name}: ${res.it.name}`);
    return `✅ „${res.it.name}" átállítva: rendelés alatt.`;
  }

  const isAdd = /adj hozza|vegyel fel|bevetelez|erkezett/.test(lower);
  const isSub = /vegyel el|vegy el|vonj le|levon/.test(lower);
  const isSet = /allitsd be|allits|legyen|\bset\b/.test(lower);
  const isQuery = /mennyi van|mutasd|keszlet|mennyi/.test(lower);

  if ((isAdd || isSub || isSet || isQuery) && term) {
    const res = searchItems(term, DB.items, 5);
    if (isQuery) {
      if (!res.length) return `Nem találtam: „${term}".`;
      return res.slice(0, 5).map(x => `• ${x.it.name} — ${fmtQty(x.it.qty)} ${x.it.unit}${x.it.ordered ? ' (rendelés alatt)' : ''}`).join('\n');
    }
    if (res.length === 1 || (res.length && res[0].score >= 80)) {
      const it = res[0].it;
      const unit = it.unit;
      if (isSet) {
        it.qty = qty;
        pushAudit('Készlet beállítás', `${currentUser.name}: ${it.name} → ${fmtQty(it.qty)} ${unit}`);
        return `✅ „${it.name}" készlete beállítva: ${fmtQty(it.qty)} ${unit}.`;
      }
      if (isSub) {
        it.qty = Math.round((it.qty - qty) * 100) / 100;
        pushAudit('Készlet levonás', `${currentUser.name}: ${it.name} −${fmtQty(qty)} ${unit}`);
        return `✅ „${it.name}" készlete: ${fmtQty(it.qty)} ${unit}.`;
      }
      it.qty = Math.round((it.qty + qty) * 100) / 100;
      it.ordered = false; it.suppressUntil = null;
      pushAudit('Készlet hozzáadás', `${currentUser.name}: ${it.name} +${fmtQty(qty)} ${unit}`);
      return `✅ „${it.name}" készlete: ${fmtQty(it.qty)} ${unit}.`;
    }
    if (res.length > 1) {
      return 'Több találat, pontosíts:\n' + res.map(x => `• ${x.it.name}`).join('\n');
    }
    // nincs találat -> új elem (add esetén)
    if (isAdd) {
      const u = unitQty ? unitQty[2] : 'db';
      const nu = { id: uid(), name: term, aliases: [], sku: '', cat: 'egyeb', unit: ['db','m','kg','l','csomag','doboz','tekercs','par'].includes(u) ? u : 'db', qty: qty, min: 0, tool: false, ordered: false, loc: 'erno', sup: '', emoji: '📦', img: null, avgWeekly: 1, suppressUntil: null };
      DB.items.unshift(nu);
      pushAudit('Új elem (chat)', `${currentUser.name}: ${term}`);
      return `🆕 Új elem létrehozva: „${term}" — ${fmtQty(nu.qty)} ${nu.unit}.`;
    }
    return `Nem találtam: „${term}".`;
  }
  return 'Ezt nem értettem. ' + CHAT_HINTS;
}
function renderChat() {
  $('#panel-chat').innerHTML = `
    <h2>💬 Chat — gyors készletkezelés</h2>
    <div class="chat-wrap">
      <div class="chat-log" id="chat-log">
        <div class="chat-msg bot">Szia! Én vagyok a raktáros asszisztens. Írd be, mit szeretnél (pl. „adj hozzá 150 m MBCu 3x2,5").</div>
      </div>
      <div class="chat-input-row">
        <input type="text" id="chat-input" placeholder="pl. adj hozzá 150 m MBCu 3x2,5" />
        <button class="btn btn-primary" id="chat-send">Küldés</button>
      </div>
      <div class="chat-hints">${CHAT_HINTS}</div>
    </div>`;
  const log = $('#chat-log');
  const send = () => {
    const inp = $('#chat-input'); const txt = inp.value.trim();
    if (!txt) return;
    log.insertAdjacentHTML('beforeend', `<div class="chat-msg user">${esc(txt)}</div>`);
    const reply = chatBotReply(txt) || 'Nem tudtam értelmezni.';
    log.insertAdjacentHTML('beforeend', `<div class="chat-msg bot">${esc(reply)}</div>`);
    inp.value = ''; log.scrollTop = log.scrollHeight;
    saveDB(); renderCatalog(); if (activeView === 'panel-admin') renderAdmin();
  };
  $('#chat-send').addEventListener('click', send);
  $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

/* ---------------- FŐNÖK: ALACSONY KÉSZLET ---------------- */
function lowStockItems() {
  return DB.items.filter(it => {
    if (it.suppressUntil && it.suppressUntil > Date.now()) return false;
    if (it.tool) return it.qty <= 0;
    return it.qty < it.min;
  });
}
function suggestQty(it) {
  if (it.tool) return 1;
  const deficit = Math.max(0, it.min - it.qty);
  return Math.ceil(deficit + it.avgWeekly);
}
function nextMonth14() {
  const d = new Date();
  const target = new Date(d.getFullYear(), d.getMonth() + 1, 14, 8, 0, 0);
  return target.getTime();
}
function renderAlerts() {
  const low = lowStockItems();
  const grouped = {};
  low.forEach(it => { (grouped[it.sup] = grouped[it.sup] || []).push(it); });
  let html = `<h2>🔔 Készlethiány & automatikus email</h2>
    <p class="muted">A rendszer 48 óránként ellenőrzi a készletet. Szerszámoknál csak 0 darabnál jelez, anyagoknál a minimum alatt.</p>`;
  if (!low.length) {
    html += `<div class="empty">Jelenleg nincs alacsony készletű tétel. 🎉</div>`;
  } else {
    html += `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Termék</th><th>Cikkszám</th><th>Készlet</th><th>Minimum</th><th>Átlag/hét</th><th>Javasolt rendelés</th><th>Szállító</th></tr></thead>
      <tbody>` + low.map(it => `
        <tr>
          <td>${esc(it.name)}${it.tool ? ' 🛠️' : ''}</td>
          <td>${esc(it.sku || '—')}</td>
          <td style="color:var(--red);font-weight:700">${fmtQty(it.qty)} ${it.unit}</td>
          <td>${fmtQty(it.min)}</td>
          <td>${fmtQty(it.avgWeekly)}</td>
          <td><b style="color:var(--amber)">${suggestQty(it)}</b> ${it.unit}</td>
          <td>${esc(supplierName(it.sup))}</td>
        </tr>`).join('') + `</tbody></table></div>`;
    html += `<div class="panel-toolbar" style="margin-top:16px">
      <button class="btn btn-primary" id="alerts-send">📧 Küldés a főnököknek (szimulált 48h ellenőrzés)</button>
    </div>
    <p class="muted">Az email szállítónként külön megy, csak az adott szállító termékeivel (név + cikkszám + javasolt mennyiség).</p>`;
  }
  $('#panel-alerts').innerHTML = html;
  const btn = $('#alerts-send');
  if (btn) btn.addEventListener('click', generateLowStockEmails);
}
function generateLowStockEmails() {
  const low = lowStockItems();
  if (!low.length) { toast('Nincs mit küldeni.'); return; }
  const grouped = {};
  low.forEach(it => { (grouped[it.sup] = grouped[it.sup] || []).push(it); });
  Object.keys(grouped).forEach(supId => {
    const items = grouped[supId];
    const sup = supplierName(supId);
    const body = `Kedves Főnök!\n\nA 48 órás ellenőrzés szerint az alábbi tételek alacsony készleten vannak a(z) ${sup} szállítónál:\n\n` +
      items.map(it => `• ${it.name}${it.sku ? ' — cikkszám: ' + it.sku : ''}\n   jelenleg: ${fmtQty(it.qty)} ${it.unit} | minimum: ${fmtQty(it.min)} | javasolt rendelés: ${suggestQty(it)} ${it.unit}`).join('\n\n') +
      `\n\nHa megrendelted, válaszolj erre az emailre, vagy jelöld be itt, és a tételek „Rendelés alatt" státuszba kerülnek. A ki nem jelölt tételeknél a rendszer a következő hónap 14-ig nem küld újra emailt.\n\nÜdv, RaktárBázis`;
    DB.emails.unshift({ id: uid(), to: DB.settings.recipients.join(', '), subject: `📦 Készlethiány — ${sup} (${items.length} tétel)`, body, ts: nowISO(), kind: 'lowstock', supplierId: supId, itemIds: items.map(i => i.id), read: false });
  });
  pushAudit('Email küldés', `Készlethiány email ${low.length} tételről`);
  saveDB();
  toast(`📧 ${Object.keys(grouped).length} email elküldve a főnököknek.`);
  renderAlerts(); renderInbox();
}

/* ---------------- FŐNÖK: EMAIL FIÓK ---------------- */
function renderInbox() {
  const emails = DB.emails;
  $('#panel-inbox').innerHTML = `<h2>📬 Email fiók (főnök)</h2><p class="muted">Címzettek: ${esc(DB.settings.recipients.join(', '))}</p>` +
    (emails.length ? emails.map(em => {
      const isLow = em.kind === 'lowstock';
      const itemsHtml = isLow ? em.itemIds.map(id => {
        const it = DB.items.find(x => x.id === id); if (!it) return '';
        const checked = !(it.suppressUntil && it.suppressUntil > Date.now()) ? 'checked' : '';
        return `<label class="email-item-line" style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border)">
          <input type="checkbox" data-email-item="${id}" ${checked} style="width:auto"/>
          <span>${esc(it.name)} <span class="hl">${esc(it.sku || '')}</span> — javasolt: ${suggestQty(it)} ${it.unit}</span>
        </label>`;
      }).join('') : '';
      return `<div class="email-card" data-email="${em.id}">
        <div class="email-head"><span class="email-subj">${em.read ? '' : '🔵 '}${esc(em.subject)}</span><span class="email-meta">${fmtTime(em.ts)}</span></div>
        <div class="email-body">${esc(em.body)}
          ${itemsHtml ? `<div style="margin-top:10px">${itemsHtml}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn btn-green" data-order-apply="${em.id}">✅ Megrendeltem a kijelölteket</button>
          </div>` : ''}
        </div>
      </div>`;
    }).join('') : '<div class="empty">Nincs email.</div>');
  $$('[data-email] .email-head').forEach(h => h.addEventListener('click', () => {
    const card = h.closest('.email-card'); card.querySelector('.email-body').classList.toggle('hidden');
    const em = DB.emails.find(e => e.id === card.dataset.email); if (em) { em.read = true; saveDB(); }
  }));
  $$('[data-order-apply]').forEach(b => b.addEventListener('click', () => {
    const em = DB.emails.find(e => e.id === b.dataset.orderApply);
    const checks = $$('[data-email-item]');
    checks.forEach(cb => {
      const it = DB.items.find(x => x.id === cb.dataset.emailItem);
      if (!it) return;
      if (cb.checked) { it.ordered = true; it.suppressUntil = null; }
      else { it.ordered = false; it.suppressUntil = nextMonth14(); }
    });
    pushAudit('Rendelés visszajelzés', `${currentUser.name} az emailre: kijelöltek megrendelve, a többi elhalasztva hó 14-ig`);
    saveDB(); renderAlerts(); renderInbox(); renderCatalog();
    toast('✅ Visszajelzés rögzítve.');
  }));
}

/* ---------------- FŐNÖK: HAVI RAPPORT ---------------- */
function renderRapport() {
  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  $('#panel-rapport').innerHTML = `
    <h2>📊 Havi rapport (kivételek)</h2>
    <div class="panel-toolbar">
      <input type="month" id="rapport-month" value="${ym}" style="padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
      <button class="btn btn-primary" id="rapport-send">📧 Havi rapport elküldése a főnököknek</button>
    </div>
    <div id="rapport-body"></div>`;
  const render = () => {
    const mv = $('#rapport-month').value; // YYYY-MM
    const [y, m] = mv.split('-').map(Number);
    const txns = DB.txns.filter(t => t.type === 'out' && new Date(t.ts).getFullYear() === y && new Date(t.ts).getMonth() === m - 1);
    const byUser = {};
    txns.forEach(t => { (byUser[t.userName] = byUser[t.userName] || []).push(t); });
    $('#rapport-body').innerHTML = txns.length
      ? Object.keys(byUser).map(un => {
          const rows = byUser[un];
          const agg = {};
          rows.forEach(r => { const k = r.itemName; agg[k] = (agg[k] || 0) + r.qty; });
          const total = rows.reduce((s, r) => s + r.qty, 0);
          return `<div style="margin-bottom:16px"><h3 style="margin:0 0 6px">👤 ${esc(un)} <span class="muted">(${rows.length} kivétel, összesen ${fmtQty(total)})</span></h3>
            <div class="table-wrap"><table class="data-table">
              <thead><tr><th>Termék</th><th>Össz. mennyiség</th><th>Hibajegyszámok</th></tr></thead>
              <tbody>${Object.keys(agg).map(k => `<tr><td>${esc(k)}</td><td>${fmtQty(agg[k])}</td><td>${esc([...new Set(rows.filter(r => r.itemName === k).map(r => r.workOrder))].join(', '))}</td></tr>`).join('')}</tbody>
            </table></div></div>`;
        }).join('')
      : '<div class="empty">Ebben a hónapban nincs kivétel.</div>';
  };
  $('#rapport-month').addEventListener('change', render);
  render();
  $('#rapport-send').addEventListener('click', () => {
    const mv = $('#rapport-month').value; const [y, m] = mv.split('-').map(Number);
    const txns = DB.txns.filter(t => t.type === 'out' && new Date(t.ts).getFullYear() === y && new Date(t.ts).getMonth() === m - 1);
    if (!txns.length) { toast('Nincs mit elküldeni ebben a hónapban.'); return; }
    const byUser = {};
    txns.forEach(t => { (byUser[t.userName] = byUser[t.userName] || []).push(t); });
    const body = `Tisztelt Főnök!\n\nHavi kivételi összesítő (${mv}):\n\n` +
      Object.keys(byUser).map(un => {
        const agg = {};
        byUser[un].forEach(r => { const k = r.itemName; agg[k] = (agg[k] || 0) + r.qty; });
        return `${un}:\n` + Object.keys(agg).map(k => `  • ${k}: ${fmtQty(agg[k])}`).join('\n');
      }).join('\n\n') + `\n\nÜdv, RaktárBázis`;
    DB.emails.unshift({ id: uid(), to: DB.settings.recipients.join(', '), subject: `📊 Havi rapport — ${mv}`, body, ts: nowISO(), kind: 'rapport', read: false });
    pushAudit('Havi rapport', `${currentUser.name} elküldte a ${mv} havi rapportot`);
    saveDB(); toast('📧 Havi rapport elküldve.'); renderInbox();
  });
}

/* ---------------- FŐNÖK: AUDIT ---------------- */
function renderAudit() {
  $('#panel-audit').innerHTML = `<h2>🧾 Audit napló</h2><p class="muted">Minden készletváltozás és művelet (csak főnököknek).</p>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Időpont</th><th>Ki</th><th>Művelet</th><th>Részlet</th></tr></thead>
      <tbody>${DB.audit.map(a => `<tr><td>${fmtTime(a.ts)}</td><td>${esc(a.userName)}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Még nincs naplóbejegyzés.</td></tr>'}</tbody>
    </table></div>`;
}

/* ---------------- FŐNÖK: CSV IMPORT ---------------- */
function renderCsv() {
  $('#panel-csv').innerHTML = `
    <h2>📥 CSV import</h2>
    <p class="muted">Fejléc nélkül, pontosvesszővel vagy vesszővel elválasztva, soronként:<br/>
    <code>név;cikkszám;kategória;mértékegység;mennyiség;minimum</code><br/>
    kategória: villany | gepesz | komuves | egyeb · mértékegység: db | m | kg | l | csomag | doboz | tekercs | pár</p>
    <div class="panel-toolbar">
      <input type="file" id="csv-file" accept=".csv,.txt" style="color:var(--muted)" />
    </div>
    <textarea id="csv-text" rows="8" style="width:100%;background:var(--bg-soft);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;font-family:ui-monospace,monospace;font-size:.85rem" placeholder="pl.:&#10;MBCu 3x2,5 rézkábel;MBCU-3X25;villany;m;23;50&#10;GEBO javító bilincs 1/2&quot;;GEBO-12;gepesz;db;9;10"></textarea>
    <button class="btn btn-green" id="csv-import" style="margin-top:10px">Beolvasás</button>
    <div id="csv-result" class="muted" style="margin-top:10px"></div>`;
  $('#csv-file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { $('#csv-text').value = r.result; };
    r.readAsText(f);
  });
  $('#csv-import').addEventListener('click', () => {
    const text = $('#csv-text').value;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let added = 0;
    lines.forEach(line => {
      const p = line.includes(';') ? line.split(';') : line.split(',');
      if (p.length < 3) return;
      const [name, sku, cat, unit, qty, min] = p.map(x => x.trim());
      DB.items.unshift({ id: uid(), name, sku, cat: ['villany','gepesz','komuves','egyeb'].includes(cat) ? cat : 'egyeb', unit: unit || 'db', qty: parseFloat(qty.replace(',', '.')) || 0, min: parseFloat((min||'0').replace(',', '.')) || 0, aliases: [], tool: false, ordered: false, loc: 'erno', sup: '', emoji: '📦', img: null, avgWeekly: 1, suppressUntil: null });
      added++;
    });
    saveDB(); renderCatalog(); renderAdmin();
    $('#csv-result').textContent = `✅ ${added} tétel beolvasva.`;
    pushAudit('CSV import', `${currentUser.name}: ${added} tétel`);
    toast(`✅ ${added} tétel beolvasva.`);
  });
}

/* ---------------- NÉZET VÁLTÁS ---------------- */
function showSection(view) {
  activeView = view;
  ['catalog-view','history-view','panel-admin','panel-chat','panel-alerts','panel-inbox','panel-rapport','panel-audit','panel-csv'].forEach(id => {
    $('#' + id).classList.toggle('hidden', id !== view);
  });
  $$('#boss-nav .bnav-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === (view === 'catalog-view' ? 'catalog' : view.replace('panel-', ''))));
  if (view === 'history-view') renderHistory();
  if (view === 'panel-admin') renderAdmin();
  if (view === 'panel-chat') renderChat();
  if (view === 'panel-alerts') renderAlerts();
  if (view === 'panel-inbox') renderInbox();
  if (view === 'panel-rapport') renderRapport();
  if (view === 'panel-audit') renderAudit();
  if (view === 'panel-csv') renderCsv();
  persistView();
}
function persistView() {
  try { localStorage.setItem('raktarbazis-view', JSON.stringify({ view: activeView, cat: activeCat, loc: activeLoc, search: currentSearch })); } catch (e) {}
}
function goCatalog() {
  showSection('catalog-view');
  renderCatalog();
}
function goHome() {
  activeCat = 'all';
  activeLoc = 'all';
  currentSearch = '';
  $('#search-input').value = '';
  $$('#cat-tabs .cat-tab').forEach(x => x.classList.toggle('active', x.dataset.cat === 'all'));
  $$('#loc-tabs .loc-tab').forEach(x => x.classList.toggle('active', x.dataset.loc === 'all'));
  showSection('catalog-view');
  renderCatalog();
  window.scrollTo(0, 0);
}

/* ---------------- BELÉPÉS / KILÉPÉS ---------------- */
function closeUserMenu() { const m = $('#user-menu'); if (m) m.classList.add('hidden'); }
function login(userId) {
  currentUser = USERS.find(u => u.id === userId) || USERS[0];
  try { localStorage.setItem('raktarbazis-session', currentUser.id); } catch (e) {}
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  const isBoss = currentUser.role === 'boss';
  $('#user-role-ico').textContent = isBoss ? '🧑‍💼' : '👷';
  $('#user-role-name').textContent = isBoss ? 'Főnök' : 'Munkás';
  $('#boss-nav').classList.toggle('hidden', !isBoss);
  activeCat = 'all'; activeLoc = 'all'; currentSearch = ''; $('#search-input').value = '';
  closeUserMenu();
  renderCatalog();
  showSection('catalog-view');
}
function logout() {
  currentUser = null;
  try { localStorage.removeItem('raktarbazis-session'); } catch (e) {}
  $('#app-view').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
  closeUserMenu();
}

/* ---------------- ESEMÉNYEK ---------------- */
function wireEvents() {
  // login
  $$('#login-role-buttons .role-btn').forEach(b => b.addEventListener('click', () => login(b.dataset.user)));
  const sel = $('#login-user-select');
  sel.innerHTML = USERS.map(u => `<option value="${u.id}">${esc(u.name)} (${u.role === 'boss' ? 'Főnök' : 'Munkás'})</option>`).join('');
  sel.addEventListener('change', () => login(sel.value));
  $('#logout-btn').addEventListener('click', logout);

  // user / role menu (fejléc)
  $('#user-menu-btn').addEventListener('click', (e) => { e.stopPropagation(); $('#user-menu').classList.toggle('hidden'); });
  $$('#user-menu [data-switch]').forEach(b => b.addEventListener('click', () => login(b.dataset.switch === 'boss' ? 'b1' : 'w1')));
  document.addEventListener('click', (e) => { if (e.target.closest && !e.target.closest('.user-wrap')) closeUserMenu(); });

  // search
  $('#search-input').addEventListener('input', e => { currentSearch = e.target.value; goCatalog(); });
  $('#clear-search').addEventListener('click', () => { $('#search-input').value = ''; currentSearch = ''; goCatalog(); });

  // cat / loc
  $$('#cat-tabs .cat-tab').forEach(b => b.addEventListener('click', () => {
    $$('#cat-tabs .cat-tab').forEach(x => x.classList.remove('active')); b.classList.add('active');
    activeCat = b.dataset.cat; goCatalog();
  }));
  $$('#loc-tabs .loc-tab').forEach(b => b.addEventListener('click', () => {
    $$('#loc-tabs .loc-tab').forEach(x => x.classList.remove('active')); b.classList.add('active');
    activeLoc = b.dataset.loc; goCatalog();
  }));

  // logo = home (teljes alapállapot visszaállítása)
  $('#logo-home').addEventListener('click', () => goHome());

  // history
  $('#history-btn').addEventListener('click', () => showSection(activeView === 'history-view' ? 'catalog-view' : 'history-view'));

  // boss nav
  $$('#boss-nav .bnav-btn').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.panel;
    showSection(p === 'catalog' ? 'catalog-view' : 'panel-' + p);
  }));

  // catalog actions (delegált)
  $('#item-grid').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    const need = e.target.closest('[data-need]');
    const edit = e.target.closest('[data-edit]');
    if (add) openQtyModal(add.dataset.add);
    if (need) {
      const it = DB.items.find(x => x.id === need.dataset.need);
      DB.emails.unshift({ id: uid(), to: DB.settings.recipients.join(', '), subject: `🙋 Rendelési igény: ${it.name}`, body: `${currentUser.name} jelzi, hogy kellene: ${it.name}${it.sku ? ' (cikkszám: ' + it.sku + ')' : ''}\nJelenleg nincs raktáron (${locLabel(it.loc)}).\nJavasolt rendelendő mennyiség (átlagfogyasztás alapján): ${suggestQty(it)} ${it.unit}.`, ts: nowISO(), kind: 'need', read: false });
      pushAudit('Rendelési igény', `${currentUser.name}: ${it.name}`);
      saveDB(); toast(`📩 Jelezve a főnököknek: ${it.name}`);
    }
    if (edit) openItemModal(edit.dataset.edit);
  });

  // cart drawer
  $('#cart-toggle').addEventListener('click', openDrawer);
  $('#cart-close').addEventListener('click', closeDrawer);
  $('#drawer-backdrop').addEventListener('click', closeDrawer);
  function openDrawer() { renderCart(); $('#cart-drawer').classList.add('open'); $('#drawer-backdrop').classList.add('show'); }
  function closeDrawer() { $('#cart-drawer').classList.remove('open'); $('#drawer-backdrop').classList.remove('show'); }
  window.openDrawer = openDrawer; window.closeDrawer = closeDrawer;

  // cart item controls (delegált)
  $('#cart-items').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    if (del) { cart = cart.filter(c => c.itemId !== del.dataset.del); renderCart(); }
    if (inc) { const l = cart.find(c => c.itemId === inc.dataset.inc); if (l) setCartQty(l.itemId, l.qty + 1); }
    if (dec) { const l = cart.find(c => c.itemId === dec.dataset.dec); if (l) setCartQty(l.itemId, l.qty - 1); }
  });
  $('#cart-items').addEventListener('change', e => {
    if (e.target.matches('[data-qty]')) setCartQty(e.target.dataset.qty, e.target.value);
  });

  // quick entry
  $('#quick-parse').addEventListener('click', () => {
    const t = $('#quick-input').value;
    if (!t.trim()) return;
    handleFreeText(t); $('#quick-input').value = '';
  });

  // quantity modal
  $('#qty-plus').addEventListener('click', () => qtyAdjust(1));
  $('#qty-minus').addEventListener('click', () => qtyAdjust(-1));
  $('#qty-confirm').addEventListener('click', () => {
    if (!pendingAddId) return;
    const qty = parseFloat($('#qty-input').value) || 0;
    if (qty <= 0) { toast('Adj meg 0-nál nagyobb mennyiséget!'); return; }
    addToCart(pendingAddId, qty);
    pendingAddId = null;
    $('#qty-modal').classList.add('hidden');
  });
  $('#qty-cancel').addEventListener('click', () => { pendingAddId = null; $('#qty-modal').classList.add('hidden'); });
  $('#qty-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#qty-confirm').click(); });

  // checkout
  $('#checkout-btn').addEventListener('click', openCheckout);
  $('#checkout-cancel').addEventListener('click', () => $('#checkout-modal').classList.add('hidden'));
  $('#checkout-confirm').addEventListener('click', doCheckout);

  // ambiguity
  $('#ambig-grid').addEventListener('click', e => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    const job = ambigQueue[0];
    addToCart(pick.dataset.pick, job.qty);
    ambigQueue.shift();
    if (ambigQueue.length) { resolveAmbiguity(); }
    else { $('#ambig-modal').classList.add('hidden'); }
  });
  $('#ambig-skip').addEventListener('click', () => {
    ambigQueue.shift();
    if (ambigQueue.length) resolveAmbiguity();
    else $('#ambig-modal').classList.add('hidden');
  });
  $('#ambig-cancel').addEventListener('click', () => { ambigQueue = []; $('#ambig-modal').classList.add('hidden'); });

  // item modal
  $('#item-save').addEventListener('click', saveItem);
  $('#item-cancel').addEventListener('click', () => $('#item-modal').classList.add('hidden'));
  $('#item-delete').addEventListener('click', deleteItem);
  $('#f-image').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { $('#f-thumb-preview').innerHTML = `<img src="${r.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>`; $('#f-thumb-preview').dataset.img = r.result; };
    r.readAsDataURL(f);
  });
  $('#f-image-reset').addEventListener('click', () => { $('#f-thumb-preview').dataset.img = ''; $('#f-thumb-preview').textContent = '📦'; });

  // admin delegated (edit buttons inside panel)
  $('#panel-admin').addEventListener('click', e => {
    const edit = e.target.closest('[data-edit]');
    if (edit) openItemModal(edit.dataset.edit);
  });
}

/* ---------------- INDÍTÁS ---------------- */
wireEvents();
// kosár visszaállítása frissítés után
try {
  const _c = JSON.parse(localStorage.getItem('raktarbazis-cart'));
  if (Array.isArray(_c)) cart = _c.filter(x => x && DB.items.some(i => i.id === x.itemId));
} catch (e) {}
let _savedSession = null;
try { _savedSession = localStorage.getItem('raktarbazis-session'); } catch (e) {}
let _savedView = null;
try { _savedView = JSON.parse(localStorage.getItem('raktarbazis-view')); } catch (e) {}
const _startUser = (_savedSession && USERS.some(u => u.id === _savedSession)) ? _savedSession : 'w1';
login(_startUser);
// nézet + szűrők visszaállítása
if (_savedView && _savedView.view) {
  const _v = _savedView.view;
  const _ok = _v === 'catalog-view' || _v === 'history-view' || (currentUser.role === 'boss' && _v.startsWith('panel-'));
  if (_ok) {
    activeCat = _savedView.cat || 'all';
    activeLoc = _savedView.loc || 'all';
    currentSearch = _savedView.search || '';
    $$('#cat-tabs .cat-tab').forEach(x => x.classList.toggle('active', x.dataset.cat === activeCat));
    $$('#loc-tabs .loc-tab').forEach(x => x.classList.toggle('active', x.dataset.loc === activeLoc));
    $('#search-input').value = currentSearch;
    renderCatalog();
    showSection(_v);
  }
}
renderCart();
