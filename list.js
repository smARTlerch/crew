// Gemeinsamer Teil der Material-Liste zum Abhaken (Büro und iPhone): Schlüssel, Mengen prüfen und zusammenführen.
// Menge pro Artikel: { qty, at } · Ziel: { no, name, at } – neuere gewinnt.
'use strict';

(function (root) {
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  // Vergleichsschlüssel: Gross/klein, Leerzeichen um Kommas und zwischen Zahl und Einheit egal
  const key = s => String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ')
    .replace(/(\d)\s+(mm|cm|m|kg|t|to|w|kw|a)\b/g, '$1$2').replace(/[\s,;.]+$/, '').trim();
  const fmt = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000).replace('.', ','));

  function cleanTake(t) {
    if (!t || typeof t !== 'object') return null;
    const q = Math.round(Number(String(t.qty == null ? '' : t.qty).replace(',', '.')) * 1000) / 1000;
    return { qty: q > 0 && q < 100000 ? q : 0, at: Number(t.at) || 0 };
  }
  function cleanDest(d) {
    if (!d || typeof d !== 'object') return { no: '', name: '', at: 0 };
    return { no: str(d.no, 40), name: str(d.name, 120), at: Number(d.at) || 0 };
  }
  // Zusammenführen: pro Artikel gewinnt die neuere Menge, nur Artikel aus der Liste
  function merge(state, back) {
    const keys = new Set((state.items || []).map(i => i.k));
    const take = { ...(state.take || {}) };
    for (const [k, v] of Object.entries((back && back.take) || {})) {
      const c = cleanTake(v);
      if (c && keys.has(k) && (!take[k] || (take[k].at || 0) <= c.at)) take[k] = c;
    }
    const a = cleanDest(state.dest), b = cleanDest(back && back.dest);
    return { ...state, take, dest: b.at > a.at ? b : a };
  }
  // Stand: abgehakt = ganze Menge, teilweise = weniger
  function count(items, take) {
    let done = 0, part = 0;
    for (const i of items || []) {
      const t = (take || {})[i.k], q = t ? t.qty : 0;
      if (q >= i.qty && q > 0) done++; else if (q > 0) part++;
    }
    return { items: (items || []).length, done, part, open: (items || []).length - done - part };
  }

  const api = { key, fmt, cleanTake, cleanDest, merge, count };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
