/* Small shared helpers: DOM, time, geo, ids. */

const $ = s => document.querySelector(s);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "07:45" -> 465 minutes after midnight
const toMin = t => { if (typeof t === 'number') return t; const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
// 465 -> "07:45"
const hm = m => { if (m == null || !isFinite(m)) return '–'; m = Math.round(m); const h = Math.floor(m / 60), mm = ((m % 60) + 60) % 60; return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };

function hav(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
const travelKm = (a, b) => hav(a, b) * S.settings.road;
const travelMin = (a, b) => travelKm(a, b) / S.settings.speed * 60;

function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function uid(p) { return p + Math.random().toString(36).slice(2, 9); }

const DAY_SHORT = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const DAY_LONG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];

const dateObj = d => new Date(d + 'T12:00:00');
const weekday = d => dateObj(d).getDay();
function ymd(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
function addDays(d, n) { const x = dateObj(d); x.setDate(x.getDate() + n); return ymd(x); }
function fmtDate(d, withDay = true) { const x = dateObj(d); return (withDay ? DAY_LONG[x.getDay()] + ' ' : '') + x.getDate() + '. ' + MONTHS[x.getMonth()]; }
function nextWeekday(d) { while ([0, 6].includes(weekday(d))) d = addDays(d, 1); return d; }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}

const kr = n => Math.round(n).toLocaleString('da-DK') + ' kr';
const num = (n, d = 0) => (+n).toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d });

// In-page confirm / prompt (browser dialogs are blocked in some embeds)
function ask(msg, opts = {}) {
  return new Promise(res => {
    const hasInput = opts.input !== undefined;
    const d = document.createElement('div'); d.className = 'modal-bg';
    d.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p>${esc(msg)}</p>${hasInput ? `<input value="${esc(opts.input)}">` : ''}
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-x="0">Annuller</button><button class="btn primary" data-x="1">${esc(opts.ok || 'OK')}</button></div></div>`;
    document.body.append(d);
    const inp = d.querySelector('input'); (inp || d.querySelector('[data-x="1"]')).focus();
    const done = ok => { d.remove(); res(ok ? (hasInput ? inp.value : true) : (hasInput ? null : false)); };
    d.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (b) done(b.dataset.x === '1'); else if (e.target === d) done(false); });
    d.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
  });
}
