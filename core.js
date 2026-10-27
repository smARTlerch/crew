// Gemeinsamer Teil: Verschlüsseln, Einträge prüfen und zusammenführen, Zeit rechnen.
// Eintrag: { start, end, pause (Min.), meal, park ('' | 'got' | 'exp'), exp (CHF), expText, note, at }
'use strict';

(function (root) {
  const PAUSE = 60;
  const PARK = { '': 'kein', got: 'erhalten', exp: 'auf Spesen' };
  const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const key = (pid, date) => `${pid}|${date}`;

  // --- Verschlüsseln (PBKDF2 + AES-256-GCM) ---------------------------------------------------------------
  const ITER = 310000, PREFIX = 'SC1.';
  const subtle = () => (root.crypto || globalThis.crypto).subtle;
  const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
  async function derive(pw, salt) {
    const base = await subtle().importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  // Objekt → Text „SC1.…“ (Salz 16 + IV 12 + Geheimtext), passt in einen Link hinter „#“
  async function seal(obj, pw) {
    if (!pw) throw new Error('Bitte zuerst ein Passwort festlegen.');
    const rnd = n => (root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(n));
    const salt = rnd(16), iv = rnd(12);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await derive(pw, salt), new TextEncoder().encode(JSON.stringify(obj))));
    const all = new Uint8Array(28 + ct.length); all.set(salt); all.set(iv, 16); all.set(ct, 28);
    return PREFIX + b64u(all);
  }
  async function open(text, pw) {
    const s = String(text || '').trim();
    if (!s.startsWith(PREFIX)) throw new Error('Diese Datei passt nicht.');
    let all;
    try { all = unb64u(s.slice(PREFIX.length)); } catch (_) { throw new Error('Die Daten sind beschädigt.'); }
    if (all.length < 29) throw new Error('Die Daten sind beschädigt.');
    try {
      const plain = await subtle().decrypt({ name: 'AES-GCM', iv: all.subarray(16, 28) }, await derive(pw, all.subarray(0, 16)), all.subarray(28));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (_) { throw new Error('Passwort falsch (oder Daten beschädigt).'); }
  }

  // --- Einträge -----------------------------------------------------------------------------------------
  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const exp = Math.round(Number(String(e.exp == null ? '' : e.exp).replace(',', '.')) * 100) / 100;
    const pause = Math.round(Number(e.pause));
    return { start: isTime(e.start) ? e.start : '', end: isTime(e.end) ? e.end : '', pause: pause >= 0 && pause <= 720 ? pause : PAUSE,
      meal: !!e.meal, park: PARK[e.park] && e.park ? e.park : '', exp: exp > 0 && exp < 100000 ? exp : 0, expText: str(e.expText, 200), note: str(e.note, 500), at: Number(e.at) || 0 };
  }
  function cleanRating(r) {
    if (!r || typeof r !== 'object') return null;
    const stars = Math.round(Number(r.stars));
    return { stars: stars >= 1 && stars <= 5 ? stars : 0, note: str(r.note, 500), at: Number(r.at) || 0 };
  }
  // Neueres gewinnt (pro Person und Tag, Bewertung pro Person)
  function mergeMap(a, b, cleanFn) {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b || {})) {
      const c = cleanFn(v);
      if (c && (!out[k] || (out[k].at || 0) <= c.at)) out[k] = c;
    }
    return out;
  }
  function merge(state, back) {
    const ids = new Set((state.people || []).map(p => p.id));
    const keep = (obj, f) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => ids.has(f(k))));
    const before = Object.keys(state.entries || {}).length;
    const entries = mergeMap(state.entries, keep(back.entries, k => k.split('|')[0]), cleanEntry);
    const ratings = mergeMap(state.ratings, keep(back.ratings, k => k), cleanRating);
    return { ...state, entries, ratings, changed: Object.keys(entries).length - before };
  }

  const mins = t => (isTime(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);
  // Minuten von Anfang bis Ende ohne Pause; Ende vor Anfang = über Mitternacht
  function workMin(e) {
    const a = mins(e && e.start), b = mins(e && e.end);
    if (a == null || b == null) return 0;
    let d = b - a; if (d <= 0) d += 1440;
    return Math.max(0, d - (Number(e.pause) || 0));
  }
  const hours = m => (m / 60).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const chf = n => (n ? n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  const fmtDay = d => new Date(`${d}T12:00:00`).toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const api = { PAUSE, PARK, key, seal, open, cleanEntry, cleanRating, merge, mergeMap, workMin, hours, chf, fmtDay, isDate, isTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
