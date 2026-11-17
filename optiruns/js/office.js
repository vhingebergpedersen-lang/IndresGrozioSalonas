/* Kørselskontor (office portal) */

const UI = {
  role: 'office', view: 'overview', leg: 'ud', open: new Set(), adhoc: false, evFilter: 'open', citSearch: '',
  instId: 'i1', opId: 'o1', citizenId: 'c1', vehicleId: 'v4', driverLeg: 'ud', citTab: 'trips', scen: [],
};
const ACT = {}, CHG = {};

const needBadges = c => [
  c.wheelchair && '<span class="need">♿ Kørestol</span>',
  c.escort && '<span class="need">👥 Ledsager</span>',
  c.alone && '<span class="need">🚫 Enekørsel</span>',
  c.knownVehicleId && `<span class="need">⭐ Fast: ${esc(vehById(c.knownVehicleId)?.name)}</span>`,
].filter(Boolean).join('');
const dot = color => `<span class="dot" style="background:${color}"></span>`;
const placeName = (req, isDrop) => {
  const atInst = (req.leg === 'ud') === isDrop;
  return atInst ? esc(instById(req.instId)?.name) : esc(citById(req.citizenId)?.address);
};

/* ---------- shared actions ---------- */

function planDay(date, legs = ['ud', 'hjem']) {
  const msgs = [];
  for (const leg of legs) {
    const { sol, plan, reqs } = optimiseLeg(date, leg);
    setPlan(date, leg, plan);
    if (S.status[date]) for (const k of Object.keys(S.status[date])) if (k.endsWith(':' + leg)) delete S.status[date][k];
    if (S.delays[date]) delete S.delays[date][leg];
    const used = sol.routes.filter(r => r.length).length;
    msgs.push(`${LEGS[leg]}: ${reqs.length - sol.un.length}/${reqs.length} ture på ${used} køretøjer`);
  }
  addEvent({ type: 'Plan', level: 'info', date, text: 'Plan lagt for ' + fmtDate(date) + '. ' + msgs.join(' · ') + '.' });
  save();
  return msgs.join(' · ');
}

function addDelay(date, leg, vehicleId, min, by) {
  const v = vehById(vehicleId);
  const total = getDelay(date, leg, vehicleId) + min;
  setDelay(date, leg, vehicleId, total);
  REV++;
  const m = dayModel(date, leg), rt = m.routes.find(r => r.v.id === vehicleId);
  const lv = liveRoute(m, rt);
  const pending = lv.nodes.filter(n => n.state === 'pending');
  const late = pending.filter(n => (leg === 'ud' ? n.d : !n.d) && n.eta > (n.d ? n.req.dl : n.req.pl) + 0.5);
  const cits = [...new Set(pending.map(n => n.req.citizenId))];
  addEvent({
    type: 'Forsinkelse', level: late.length ? 'bad' : 'warn', date, vehicleId, citizenIds: cits,
    text: `${v.name} (${opById(v.operatorId).name}) er nu ca. ${total} min forsinket, meldt af ${by}. ` +
      (late.length ? `${late.length} borger(e) forventes uden for aftalt tid: ${late.map(n => citById(n.req.citizenId).name).join(', ')}.` : 'Alle forventes stadig inden for aftalt tid.') +
      ` ${cits.length} borgere/pårørende har fået besked i appen.`,
  });
  save();
}

function replanVehicle(date, leg, vehicleId) {
  const m = dayModel(date, leg), rt = m.routes.find(r => r.v.id === vehicleId);
  const lv = liveRoute(m, rt);
  const pendingTrips = [...new Set(lv.nodes.filter(n => !n.d && n.state === 'pending').map(n => n.req.id))];
  const plan = getPlan(date, leg);
  const pr = plan.routes.find(r => r.vehicleId === vehicleId);
  pr.nodes = pr.nodes.filter(n => !pendingTrips.includes(n.r));
  save();
  let moved = 0; const failed = [];
  for (const id of pendingTrips) {
    const res = insertIntoPlan(date, leg, id); save();
    if (res) moved++; else failed.push(citById(m.reqs[m.c.idx.get(id)].citizenId).name);
  }
  addEvent({ type: 'Omplanlægning', level: failed.length ? 'bad' : 'info', date, vehicleId,
    text: `${moved} ture flyttet fra ${vehById(vehicleId).name} til andre køretøjer.` + (failed.length ? ` Kunne ikke placeres: ${failed.join(', ')}.` : '') });
  save();
  toast(`${moved} ture flyttet` + (failed.length ? `, ${failed.length} mangler plads` : ''));
}

ACT.planDay = () => { const b = document.activeElement; if (b) b.disabled = true; toast('Optimerer…'); setTimeout(() => { toast(planDay(S.date)); render(); }, 30); };
ACT.planLeg = () => { toast('Optimerer…'); setTimeout(() => { toast(planDay(S.date, [UI.leg])); render(); }, 30); };
ACT.clearLeg = async () => { if (!await ask('Slet planen for ' + LEGS[UI.leg].toLowerCase() + '?')) return; if (S.plans[S.date]) delete S.plans[S.date][UI.leg]; save(); render(); };
ACT.leg = d => { UI.leg = d.leg; render(); };
ACT.toggleRoute = d => { UI.open.has(d.id) ? UI.open.delete(d.id) : UI.open.add(d.id); render(); };
ACT.delay = d => { addDelay(S.date, d.leg || UI.leg, d.id, +d.min, d.by || 'kørselskontoret'); toast(`Forsinkelse registreret, berørte borgere har fået besked`); render(); };
ACT.clearDelay = d => { setDelay(S.date, UI.leg, d.id, 0); save(); render(); };
ACT.replan = d => { for (const leg of ['ud', 'hjem']) { const m = dayModel(S.date, leg); if (m.routes.find(r => r.v.id === d.id)?.codes.length) replanVehicle(S.date, leg, d.id); } render(); };
ACT.insertReq = d => {
  const res = insertIntoPlan(S.date, UI.leg, d.req); save();
  if (res) { toast(`Indsat på ${vehById(res.vehicleId).name} (+${kr(res.extra)})`); UI.open.add(res.vehicleId); }
  else toast('Ingen ledig plads der overholder reglerne. Prøv at optimere igen eller tilføj et køretøj.');
  render();
};
ACT.insertAll = () => {
  const m = dayModel(S.date, UI.leg); let ok = 0;
  for (const r of m.unplanned) { if (insertIntoPlan(S.date, UI.leg, r.id)) ok++; save(); }
  toast(`${ok} af ${m.unplanned.length} ture indsat`); render();
};
ACT.removeTrip = d => {
  const p = getPlan(S.date, UI.leg); p.routes.forEach(r => r.nodes = r.nodes.filter(n => n.r !== d.req)); save(); render();
};
CHG.moveTrip = (el) => {
  const reqId = el.dataset.req, to = el.value; if (!to) return;
  const p = getPlan(S.date, UI.leg); p.routes.forEach(r => r.nodes = r.nodes.filter(n => n.r !== reqId)); save();
  const res = insertIntoPlan(S.date, UI.leg, reqId, to); save();
  UI.open.add(to);
  toast(res?.forced ? 'Flyttet, men turen bryder reglerne på det køretøj (se advarsel)' : 'Turen er flyttet og tiderne er genberegnet');
  render();
};
ACT.toggleAdhoc = () => { UI.adhoc = !UI.adhoc; render(); };
ACT.addAdhoc = () => {
  const f = $('#adhocForm'); const g = n => f.querySelector(`[name=${n}]`).value;
  const a = { id: uid('a'), date: S.date, citizenId: g('cit'), instId: g('inst'), leg: g('leg'), time: g('time') };
  S.adhoc.push(a); save();
  const c = citById(a.citizenId), inst = instById(a.instId);
  let txt = `Enkeltkørsel oprettet: ${c.name} ${a.leg === 'ud' ? 'til' : 'fra'} ${inst.name} kl. ${a.time}.`;
  let level = 'info';
  if (getPlan(S.date, a.leg)) {
    const res = insertIntoPlan(S.date, a.leg, a.id + ':' + a.leg);
    if (res) { txt += ` Indsat på ${vehById(res.vehicleId).name}, merpris ca. ${kr(res.extra)}.`; UI.open.add(res.vehicleId); }
    else { txt += ' Ingen ledig plads på eksisterende ruter.'; level = 'warn'; }
  }
  addEvent({ type: 'Enkeltkørsel', level, date: S.date, citizenIds: [c.id], instId: inst.id, text: txt });
  UI.adhoc = false; UI.leg = a.leg; save(); toast(txt); render();
};

/* ---------- Overblik ---------- */

function renderOverview() {
  const d = S.date, models = [dayModel(d, 'ud'), dayModel(d, 'hjem')];
  const anyPlan = models.some(m => m.plan);
  const cancelled = S.cancellations.filter(x => x.date === d).length;
  let total = 0, late = 0, done = 0, all = 0;
  const rows = [];
  for (const m of models) for (const rt of m.routes) {
    if (!rt.codes.length) continue;
    const lv = liveRoute(m, rt);
    for (const n of lv.nodes) {
      all++; if (n.state !== 'pending') done++;
      if (n.state === 'noshow' || n.state === 'skipped') continue;
      if ((m.leg === 'ud' && n.d) || (m.leg === 'hjem' && !n.d)) { total++; if (n.eta > (n.d ? n.req.dl : n.req.pl) + 0.5) late++; }
    }
    rows.push({ m, rt, lv });
  }
  const T = k => models.reduce((a, m) => a + m.totals[k], 0);
  const ev = openEvents();
  const byOp = S.operators.map(o => {
    const rs = rows.filter(r => r.rt.v.operatorId === o.id);
    return { o, veh: new Set(rs.map(r => r.rt.v.id)).size, h: rs.reduce((a, r) => a + (r.rt.sched.end - r.rt.sched.start) / 60, 0), km: rs.reduce((a, r) => a + r.rt.sched.km, 0), cost: rs.reduce((a, r) => a + r.rt.sched.cost, 0) };
  });
  rows.sort((a, b) => ({ Kører: 0, 'Ikke startet': 1, Afsluttet: 2 }[a.lv.phase] - { Kører: 0, 'Ikke startet': 1, Afsluttet: 2 }[b.lv.phase]) || a.lv.start - b.lv.start);

  $('#v-overview').innerHTML = `<div class="inner">
    <div class="row" style="margin-bottom:14px"><div><h2>Overblik · ${fmtDate(d)}</h2><div class="muted">Kl. ${hm(S.clock)} · ${S.institutions.length} institutioner · ${S.citizens.length} borgere med bevilling</div></div>
      <div class="spacer"></div><button class="btn primary" data-act="planDay">⚡ ${anyPlan ? 'Optimér dagen igen' : 'Planlæg dagen'}</button></div>
    ${!anyPlan ? `<div class="banner blue">📋 <div><b>Der er ikke lagt en plan for ${fmtDate(d)} endnu.</b><br><span class="small">${T('trips')} ture skal køres. Tryk <b>Planlæg dagen</b> for at fordele dem på køretøjerne, eller gå til <b>Planlægning</b>.</span></div></div>` : ''}
    <div class="kpis">
      <div class="kpi"><b>${T('trips')}</b><span>Ture i dag</span></div>
      <div class="kpi"><b>${cancelled}</b><span>Afbestilt</span></div>
      <div class="kpi"><b>${new Set(rows.map(r => r.rt.v.id)).size}</b><span>Køretøjer i brug</span></div>
      <div class="kpi"><b>${num(T('hours'), 1)}</b><span>Køretøjstimer</span></div>
      <div class="kpi"><b>${num(T('km'))}</b><span>Km</span></div>
      <div class="kpi"><b>${kr(T('cost'))}</b><span>Est. pris</span></div>
      <div class="kpi"><b style="color:${late ? 'var(--warn)' : 'var(--ok)'}">${total ? Math.round((total - late) / total * 100) : 100}%</b><span>Til tiden (forventet)</span></div>
      <div class="kpi"><b style="color:${ev.length ? 'var(--bad)' : 'inherit'}">${ev.length}</b><span>Åbne afvigelser</span></div>
    </div>
    <div class="grid2">
      <div>
        <div class="panel"><div class="panel-head"><h3>Kørsler i dag</h3><span class="muted small">${all ? Math.round(done / all * 100) : 0}% af stop afviklet</span></div>
          ${rows.length ? `<table><thead><tr><th>Køretøj</th><th>Kørsel</th><th>Status</th><th>Næste stop</th><th>I bilen</th><th>Fremdrift</th></tr></thead><tbody>
          ${rows.map(({ m, rt, lv }) => `<tr>
            <td>${dot(rt.v.color)} <b>${esc(rt.v.name)}</b><div class="small muted">${esc(opById(rt.v.operatorId).name)}</div></td>
            <td>${LEGS[m.leg]}<div class="small muted">${hm(lv.start)}–${hm(lv.end)}</div></td>
            <td>${lv.phase === 'Kører' ? '<span class="tag blue">Kører</span>' : lv.phase === 'Afsluttet' ? '<span class="tag ok">Afsluttet</span>' : '<span class="tag grey">Ikke startet</span>'}
                ${lv.delay ? `<span class="tag warn">+${lv.delay} min</span>` : ''}${rt.sched.issues.length ? '<span class="tag bad">⚠</span>' : ''}</td>
            <td>${lv.next ? `${lv.next.d ? '↓' : '↑'} ${esc(citById(lv.next.req.citizenId).name)}<div class="small muted">ca. ${hm(lv.next.eta)}</div>` : '–'}</td>
            <td>${lv.onboard}</td>
            <td><div class="rbar" style="width:80px"><div style="width:${lv.nodes.length ? lv.doneN / lv.nodes.length * 100 : 0}%;background:${rt.v.color}"></div></div><span class="small muted">${lv.doneN}/${lv.nodes.length}</span></td>
          </tr>`).join('')}</tbody></table>` : '<div class="empty">Ingen planlagte kørsler endnu</div>'}
        </div>
      </div>
      <div>
        <div class="panel"><div class="panel-head"><h3>Afvigelser der kræver handling</h3><button class="btn sm spacer" data-act="view" data-view="events">Se alle</button></div>
          ${ev.length ? ev.slice(0, 8).map(eventRow).join('') : '<div class="empty">Ingen åbne afvigelser 👍</div>'}
        </div>
        <div class="panel"><div class="panel-head"><h3>Pr. vognmand (estimeret afregning)</h3></div>
          <table><thead><tr><th>Vognmand</th><th>Biler</th><th>Timer</th><th>Km</th><th>Pris</th></tr></thead><tbody>
          ${byOp.map(x => `<tr><td>${esc(x.o.name)}</td><td>${x.veh}</td><td>${num(x.h, 1)}</td><td>${num(x.km)}</td><td>${kr(x.cost)}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>
    </div></div>`;
}

/* ---------- Planlægning ---------- */

function renderPlan() {
  const m = dayModel(S.date, UI.leg), t = m.totals;
  const active = S.vehicles.filter(v => v.active);
  const vOpts = cur => active.filter(v => v.id !== cur).map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  const reqOf = m.reqs;
  let html = `<div class="side-top">
    <div class="seg"><button data-act="leg" data-leg="ud" class="${UI.leg === 'ud' ? 'active' : ''}">☀️ Udkørsel (morgen)</button><button data-act="leg" data-leg="hjem" class="${UI.leg === 'hjem' ? 'active' : ''}">🌇 Hjemkørsel (eftermiddag)</button></div>
    <div class="row">
      <button class="btn primary" data-act="planDay">⚡ Optimér hele dagen</button>
      <button class="btn" data-act="planLeg">Kun ${LEGS[UI.leg].toLowerCase()}</button>
      <button class="btn" data-act="toggleAdhoc">＋ Enkeltkørsel</button>
      ${m.plan ? '<button class="btn sm danger" data-act="clearLeg" title="Slet plan">✕</button>' : ''}
    </div>
    ${UI.adhoc ? `<div class="adhoc"><b>Ny enkeltkørsel</b> <span class="small muted">fx til hospital. Indsættes i den eksisterende plan uden at flytte andre.</span>
      <div class="form-grid" id="adhocForm" style="margin-top:8px">
        <label class="w2">Borger<select name="cit">${S.citizens.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="w2">Destination<select name="inst">${S.institutions.map(i => `<option value="${i.id}" ${i.type === 'Hospital' ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>
        <label class="w2">Retning<select name="leg"><option value="ud">Ud (ankomst senest)</option><option value="hjem">Hjem (afhentning fra)</option></select></label>
        <label>Tid<input name="time" type="time" value="10:30"></label>
        <div class="row" style="align-self:end"><button class="btn primary" data-act="addAdhoc">Opret og indsæt</button></div>
      </div></div>` : ''}
    <div class="mini-kpis">
      <div><b>${t.planned}/${t.trips}</b><span>Planlagt</span></div>
      <div><b>${t.vehicles}</b><span>Køretøjer</span></div>
      <div><b>${num(t.km)}</b><span>Km</span></div>
      <div><b>${num(t.hours, 1)}</b><span>Timer</span></div>
      <div><b>${num(t.cost / 1000, 1)}k</b><span>Kr.</span></div>
    </div>
  </div><div class="side-scroll">`;

  if (!m.plan) html += `<div class="empty">Ingen plan for ${LEGS[UI.leg].toLowerCase()} ${fmtDate(S.date)}.<br><br><b>${m.reqs.length}</b> ture og <b>${active.length}</b> aktive køretøjer.<br>Tryk <b>⚡ Optimér</b> for at lægge ruterne.</div>`;
  if (m.plan && m.unplanned.length) html += `<div class="unplanned"><div class="row"><b>${m.unplanned.length} tur(e) ikke på en rute</b><button class="btn sm spacer" data-act="insertAll">Indsæt alle</button></div>
    ${m.unplanned.map(r => `<div class="u"><span>${esc(citById(r.citizenId).name)} <span class="muted small">${esc(r.type)} · ${r.leg === 'ud' ? 'møder' : 'fri'} ${hm(r.time)}</span></span><button class="btn sm spacer" data-act="insertReq" data-req="${r.id}">Indsæt</button></div>`).join('')}</div>`;

  for (const rt of m.routes) {
    if (!rt.codes.length) continue;
    const lv = liveRoute(m, rt), v = rt.v, s = rt.sched;
    const flag = s.issues.length > 0;
    html += `<div class="rcard ${UI.open.has(v.id) ? 'open' : ''} ${flag ? 'flag' : ''}">
      <div class="rhead" data-act="toggleRoute" data-id="${v.id}">
        ${dot(v.color)}
        <div><div class="nm">${esc(v.name)} ${flag ? '<span class="tag bad">⚠ ' + s.issues.length + '</span>' : '<span class="tag ok">OK</span>'} ${lv.delay ? `<span class="tag warn">+${lv.delay} min</span>` : ''}</div>
          <div class="small muted">${esc(opById(v.operatorId).name)} · ${esc(v.driver)} · ${v.seats} pl. ${v.wc ? '+ ' + v.wc + ' ♿' : ''}</div></div>
        <div class="meta"><b style="color:var(--ink)">${hm(lv.start)}–${hm(lv.end)}</b><br>${rt.codes.length / 2} ture · ${num(s.km, 1)} km · ${kr(s.cost)}</div>
      </div>
      <div class="rbar"><div style="width:${lv.doneN / lv.nodes.length * 100}%;background:${v.color}"></div></div>
      ${flag ? `<div class="issues">⚠ ${s.issues.join(' · ')}</div>` : ''}
      <div class="rbody">
        <div class="row" style="padding:6px 0">
          <button class="btn sm" data-act="delay" data-id="${v.id}" data-min="10">+10 min forsinkelse</button>
          ${lv.delay ? `<button class="btn sm" data-act="clearDelay" data-id="${v.id}">Nulstil forsinkelse</button>` : ''}
          ${!v.active ? `<button class="btn sm primary" data-act="replan" data-id="${v.id}">Flyt ture til andre biler</button>` : ''}
        </div>
        <div class="base-line">🅿 Afgang fra garage ${hm(lv.start)}</div>
        ${lv.nodes.map(n => {
          const r = n.req, c = citById(r.citizenId), lateN = n.eta > (n.d ? r.dl : r.pl) + 0.5;
          const st = n.state === 'done' ? `<span class="tag ok">${n.d ? 'Afleveret' : 'Hentet'}</span>` : n.state === 'noshow' ? '<span class="tag bad">Ikke mødt</span>' : n.state === 'skipped' ? '<span class="tag grey">Udgår</span>' : lateN ? '<span class="tag warn">Forsinket</span>' : n.wait > 3 ? `<span class="tag grey">venter ${Math.round(n.wait)}m</span>` : '';
          const win = r.leg === 'ud' ? (n.d ? `møder ${hm(r.time)}` : `maks ${Math.round(r.ride)}m`) : (n.d ? `kørsel ${Math.round(n.rideMin)}/${Math.round(r.ride)}m` : `fri ${hm(r.time)}`);
          return `<div class="stop ${n.state !== 'pending' ? 'done' : ''}">
            <div class="tm">${hm(n.eta)}<small>${win}</small></div>
            <div class="ic ${n.d ? 'D' : 'P'}" style="background:${v.color};border-color:${v.color};color:${n.d ? v.color : '#fff'}">${n.d ? '↓' : '↑'}</div>
            <div><b>${esc(c.name)}</b> ${st}<div class="small muted">${n.d ? 'Aflever' : 'Hent'} · ${placeName(r, n.d)}</div>
              ${!n.d ? `<div>${needBadges(c)}</div>` : ''}
              ${!n.d && n.state === 'pending' ? `<div class="acts"><select data-chg="moveTrip" data-req="${r.id}"><option value="">Flyt til…</option>${vOpts(v.id)}</select>
              <button class="btn sm" data-act="removeTrip" data-req="${r.id}">Tag af rute</button></div>` : ''}
            </div></div>`;
        }).join('')}
        <div class="base-line">🅿 Retur i garage ${hm(lv.end)} (vagt slutter ${v.end})</div>
      </div></div>`;
  }
  const idle = active.filter(v => !m.routes.find(r => r.v.id === v.id && r.codes.length));
  if (m.plan && idle.length) html += `<div class="small muted" style="padding:6px 2px">Ledige køretøjer: ${idle.map(v => esc(v.name)).join(', ')}</div>`;
  html += '</div>';
  $('#planSide').innerHTML = html;
  renderMap(m);
}

/* ---------- Map ---------- */

let map = null, mapLayer = null, lastFit = '', tilesBlocked = false;
function initMap() {
  if (typeof L === 'undefined') { $('#map').innerHTML = '<div class="map-fallback">Kortet kunne ikke indlæses (ingen internet?). Resten af systemet virker.</div>'; return; }
  map = L.map('map', { zoomControl: true }).setView([55.67, 12.43], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' })
    .on('tileerror', () => { if (!tilesBlocked) { tilesBlocked = true; if (UI.view === 'plan') renderMap(dayModel(S.date, UI.leg)); } })
    .addTo(map);
  mapLayer = L.layerGroup().addTo(map);
}
function renderMap(m) {
  if (!map) return;
  mapLayer.clearLayers();
  const icon = (html, size) => L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
  const pts = [];
  for (const i of S.institutions) { L.marker([i.lat, i.lng], { icon: icon('<div class="inst-pin">' + ({ Skole: '🏫', Dagcenter: '☕', Hospital: '🏥', Genoptræning: '💪' }[i.type] || '🏠') + '</div>', 30), zIndexOffset: 900 }).bindPopup(`<b>${esc(i.name)}</b><br>${esc(i.address)}<br>${i.open}–${i.close}`).addTo(mapLayer); pts.push([i.lat, i.lng]); }
  for (const o of S.operators) L.marker([o.lat, o.lng], { icon: icon('<div class="garage-pin">🅿</div>', 24) }).bindPopup(`<b>${esc(o.name)}</b><br>Garage · ${esc(o.address)}`).addTo(mapLayer);
  for (const rt of m.routes) {
    if (!rt.codes.length) continue;
    const lv = liveRoute(m, rt), v = rt.v, op = opById(v.operatorId);
    const line = [[op.lat, op.lng], ...lv.nodes.map(n => { const p = n.d ? n.req.drop : n.req.pick; return [p.lat, p.lng]; }), [op.lat, op.lng]];
    L.polyline(line, { color: v.color, weight: 4, opacity: UI.open.size && !UI.open.has(v.id) ? .25 : .85 }).addTo(mapLayer);
    lv.nodes.forEach((n, i) => {
      const atHome = (m.leg === 'ud') !== n.d; if (!atHome) return;
      const c = citById(n.req.citizenId); pts.push([c.lat, c.lng]);
      L.marker([c.lat, c.lng], { icon: icon(`<div class="pin ${n.state !== 'pending' ? 'done' : ''}" style="background:${v.color}">${i + 1}</div>`, 24) })
        .bindPopup(`<b>${esc(c.name)}</b><br>${esc(c.address)}<br>${esc(v.name)} · ${n.d ? 'aflevering' : 'afhentning'} ca. <b>${hm(n.eta)}</b><br>${needBadges(c)}`).addTo(mapLayer);
    });
    if (lv.pos) L.marker([lv.pos.lat, lv.pos.lng], { icon: icon(`<div class="veh-pin" style="background:${v.color}">🚐</div>`, 34), zIndexOffset: 2000 })
      .bindPopup(`<b>${esc(v.name)}</b> · ${esc(v.driver)}<br>${lv.onboard} borgere i bilen${lv.next ? '<br>Næste: ' + esc(citById(lv.next.req.citizenId).name) + ' ca. ' + hm(lv.next.eta) : ''}`).addTo(mapLayer);
  }
  for (const r of m.unplanned) { const c = citById(r.citizenId); pts.push([c.lat, c.lng]); L.marker([c.lat, c.lng], { icon: icon('<div class="pin" style="background:#8b95a7">!</div>', 24) }).bindPopup(`<b>${esc(c.name)}</b><br>Ikke planlagt`).addTo(mapLayer); }
  $('#mapLegend').innerHTML = `${LEG_LONG[m.leg]} · tal = rækkefølge på ruten · 🚐 = køretøj kl. ${hm(S.clock)}` +
    (tilesBlocked ? '<br><span class="muted">Kortbaggrunden kan ikke hentes her. Åbn index.html lokalt for at se vejkortet.</span>' : '');
  const key = m.date + m.leg + (m.plan ? 1 : 0);
  if (key !== lastFit && pts.length) { map.fitBounds(L.latLngBounds(pts).pad(0.06)); lastFit = key; }
}

/* ---------- Borgere & bevillinger ---------- */

function renderCitizens() {
  const q = UI.citSearch.toLowerCase();
  const list = S.citizens.filter(c => !q || (c.name + c.address).toLowerCase().includes(q));
  const vehOpts = sel => `<option value="">–</option>` + S.vehicles.map(v => `<option value="${v.id}" ${sel === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  const instOpts = sel => S.institutions.map(i => `<option value="${i.id}" ${sel === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
  const types = ['Skolekørsel', 'Handicapkørsel', 'Ældrekørsel', 'Genoptræning'];
  $('#v-citizens').innerHTML = `<div class="inner">
    <h2>Borgere &amp; bevillinger</h2>
    <p class="sub">Hver borger har en bevilling (visitation) med destination, ugedage, tider og serviceniveau. Behov som kørestol, ledsager, enekørsel og fast chauffør overholdes af planlægningen.</p>
    <div class="panel"><div class="panel-head"><h3>Ny borger</h3></div><div class="panel-body">
      <div class="form-grid" id="citForm">
        <label class="w2">Navn<input name="name" placeholder="Fornavn Efternavn"></label>
        <label class="w2">Adresse<input name="address" placeholder="Vej nr, postnr by"></label>
        <label>Breddegrad<input name="lat" type="number" step="any" placeholder="55.67"></label>
        <label>Længdegrad<input name="lng" type="number" step="any" placeholder="12.43"></label>
        <label class="w2">Destination<select name="inst">${instOpts('i1')}</select></label>
        <label>Kørselstype<select name="type">${types.map(t => `<option>${t}</option>`).join('')}</select></label>
        <label>Mødetid<input name="arrive" type="time" value="08:00"></label>
        <label>Hjem fra<input name="leave" type="time" value="14:00"></label>
        <label>Maks. køretid (min)<input name="maxRide" type="number" value="45"></label>
        <label class="w2">Pårørende<input name="relative" placeholder="Mor · 12 34 56 78"></label>
        <div class="row w3"><label class="check"><input type="checkbox" name="wheelchair"> Kørestol</label><label class="check"><input type="checkbox" name="escort"> Ledsager</label><label class="check"><input type="checkbox" name="alone"> Enekørsel</label></div>
        <div class="row all"><button class="btn primary" data-act="addCitizen">Opret borger med bevilling (man–fre)</button><button class="btn" data-act="geocode">🔎 Find koordinater ud fra adressen</button></div>
      </div></div></div>
    <div class="panel"><div class="panel-head"><h3>${list.length} borgere</h3><input class="spacer" style="border:1px solid var(--line);border-radius:6px;padding:5px 9px;width:240px" placeholder="Søg navn eller adresse…" value="${esc(UI.citSearch)}" data-chg="citSearch"></div>
      <div style="overflow-x:auto"><table><thead><tr><th>Borger</th><th>Behov</th><th>Fast køretøj</th><th>Destination</th><th>Ugedage</th><th>Møder</th><th>Hjem</th><th>Maks. køretid</th><th>Note til chauffør</th><th></th></tr></thead><tbody>
      ${list.map(c => {
        const v = S.visitations.find(x => x.citizenId === c.id);
        return `<tr>
          <td style="min-width:210px"><input data-chg="cit" data-id="${c.id}" data-f="name" value="${esc(c.name)}" style="font-weight:600"><input data-chg="cit" data-id="${c.id}" data-f="address" value="${esc(c.address)}" class="small"></td>
          <td style="white-space:nowrap">${['wheelchair:♿', 'escort:👥', 'alone:🚫'].map(x => { const [f, ic] = x.split(':'); return `<label class="check" style="display:inline-flex;margin-right:6px" title="${{ wheelchair: 'Kørestol', escort: 'Ledsager', alone: 'Enekørsel' }[f]}"><input type="checkbox" data-chg="citFlag" data-id="${c.id}" data-f="${f}" ${c[f] ? 'checked' : ''}>${ic}</label>`; }).join('')}</td>
          <td><select data-chg="cit" data-id="${c.id}" data-f="knownVehicleId">${vehOpts(c.knownVehicleId)}</select></td>
          ${v ? `<td style="min-width:170px"><select data-chg="vis" data-id="${v.id}" data-f="institutionId">${instOpts(v.institutionId)}</select><div class="small muted" style="padding-left:6px">${esc(v.type)}</div></td>
          <td><div class="days">${[1, 2, 3, 4, 5].map(dd => `<label class="${v.days.includes(dd) ? 'on' : ''}"><input type="checkbox" data-chg="visDay" data-id="${v.id}" data-day="${dd}" ${v.days.includes(dd) ? 'checked' : ''}>${DAY_SHORT[dd][0]}</label>`).join('')}</div></td>
          <td><input type="time" class="w80" data-chg="vis" data-id="${v.id}" data-f="arrive" value="${v.arrive}"></td>
          <td><input type="time" class="w80" data-chg="vis" data-id="${v.id}" data-f="leave" value="${v.leave}"></td>
          <td><input type="number" class="w60" data-chg="vis" data-id="${v.id}" data-f="maxRide" value="${v.maxRide}"> min</td>` : '<td colspan="5" class="muted">Ingen bevilling</td>'}
          <td><input data-chg="cit" data-id="${c.id}" data-f="note" value="${esc(c.note)}"></td>
          <td><button class="btn sm danger" data-act="delCitizen" data-id="${c.id}">✕</button></td>
        </tr>`;
      }).join('')}</tbody></table></div></div></div>`;
}
CHG.citSearch = el => { UI.citSearch = el.value; renderCitizens(); const i = document.querySelector('[data-chg=citSearch]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
CHG.cit = el => { const c = citById(el.dataset.id); c[el.dataset.f] = el.value; save(); };
CHG.citFlag = el => { const c = citById(el.dataset.id); c[el.dataset.f] = el.checked; save(); toast('Gemt · ændringen gælder ved næste optimering'); };
CHG.vis = el => { const v = S.visitations.find(x => x.id === el.dataset.id); v[el.dataset.f] = el.dataset.f === 'maxRide' ? +el.value : el.value; save(); toast('Bevilling opdateret'); };
CHG.visDay = el => { const v = S.visitations.find(x => x.id === el.dataset.id), d = +el.dataset.day; v.days = el.checked ? [...new Set([...v.days, d])].sort() : v.days.filter(x => x !== d); save(); renderCitizens(); };
ACT.delCitizen = async d => { if (!await ask('Slet borger og bevilling?')) return; S.citizens = S.citizens.filter(c => c.id !== d.id); S.visitations = S.visitations.filter(v => v.citizenId !== d.id); save(); render(); };
ACT.addCitizen = () => {
  const f = $('#citForm'), g = n => f.querySelector(`[name=${n}]`), val = n => g(n).value.trim();
  if (!val('name')) return toast('Skriv et navn');
  if (!val('lat') || !val('lng')) return toast('Koordinater mangler: brug "Find koordinater"');
  const id = uid('c');
  S.citizens.push({ id, name: val('name'), address: val('address'), lat: +val('lat'), lng: +val('lng'), phone: '', relative: val('relative'), wheelchair: g('wheelchair').checked, escort: g('escort').checked, alone: g('alone').checked, knownVehicleId: '', note: '' });
  S.visitations.push({ id: uid('b'), citizenId: id, institutionId: val('inst'), type: val('type'), days: [1, 2, 3, 4, 5], arrive: val('arrive'), leave: val('leave'), maxRide: +val('maxRide') || 45, ud: true, hjem: true });
  addEvent({ type: 'Ny bevilling', level: 'info', citizenIds: [id], text: `${val('name')} er oprettet med ${val('type').toLowerCase()} til ${instById(val('inst')).name}.` });
  save(); toast('Borger oprettet · kommer med i næste optimering'); render();
};
ACT.geocode = async () => {
  const f = $('#citForm'), q = f.querySelector('[name=address]').value.trim();
  if (!q) return toast('Skriv en adresse først');
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=dk&q=' + encodeURIComponent(q));
    const j = await r.json(); if (!j.length) return toast('Adressen blev ikke fundet');
    f.querySelector('[name=lat]').value = (+j[0].lat).toFixed(5); f.querySelector('[name=lng]').value = (+j[0].lon).toFixed(5);
    toast('Fundet: ' + j[0].display_name.slice(0, 70));
  } catch (e) { toast('Opslag fejlede (ingen internet?)'); }
};

/* ---------- Institutioner ---------- */

function renderInstitutions() {
  $('#v-institutions').innerHTML = `<div class="inner">
    <div class="row" style="margin-bottom:14px"><div><h2>Institutioner</h2><div class="muted">Skoler, dagcentre, aktivitetstilbud og andre destinationer.</div></div><button class="btn primary spacer" data-act="addInst">＋ Tilføj institution</button></div>
    <div class="panel"><div style="overflow-x:auto"><table><thead><tr><th>Navn</th><th>Type</th><th>Adresse</th><th>Bredde</th><th>Længde</th><th>Åbner</th><th>Lukker</th><th>Kontakt</th><th>Borgere</th></tr></thead><tbody>
    ${S.institutions.map(i => `<tr>
      ${['name', 'type', 'address'].map(f => `<td><input data-chg="inst" data-id="${i.id}" data-f="${f}" value="${esc(i[f])}"></td>`).join('')}
      <td><input class="w80" type="number" step="any" data-chg="inst" data-id="${i.id}" data-f="lat" value="${i.lat}"></td>
      <td><input class="w80" type="number" step="any" data-chg="inst" data-id="${i.id}" data-f="lng" value="${i.lng}"></td>
      <td><input class="w80" type="time" data-chg="inst" data-id="${i.id}" data-f="open" value="${i.open}"></td>
      <td><input class="w80" type="time" data-chg="inst" data-id="${i.id}" data-f="close" value="${i.close}"></td>
      <td><input data-chg="inst" data-id="${i.id}" data-f="contact" value="${esc(i.contact)}"></td>
      <td>${S.visitations.filter(v => v.institutionId === i.id).length}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;
}
CHG.inst = el => { const i = instById(el.dataset.id), f = el.dataset.f; i[f] = ['lat', 'lng'].includes(f) ? +el.value : el.value; save(); };
ACT.addInst = () => { S.institutions.push({ id: uid('i'), name: 'Ny institution', type: 'Skole', address: '', lat: 55.67, lng: 12.43, open: '08:00', close: '15:00', contact: '' }); save(); render(); };

/* ---------- Vognmænd & køretøjer ---------- */

function renderOperators() {
  $('#v-operators').innerHTML = `<div class="inner">
    <div class="row" style="margin-bottom:14px"><div><h2>Vognmænd &amp; køretøjer</h2><div class="muted">Kontrakter, garage, køretøjer, pladser og vagttider.</div></div><button class="btn primary spacer" data-act="addOp">＋ Tilføj vognmand</button></div>
    ${S.operators.map(o => `<div class="panel">
      <div class="panel-head"><input data-chg="op" data-id="${o.id}" data-f="name" value="${esc(o.name)}" style="font-weight:700;font-size:15px;border:1px solid transparent;padding:3px 5px;border-radius:5px">
        <span class="muted small">Garage:</span><input data-chg="op" data-id="${o.id}" data-f="address" value="${esc(o.address)}" style="border:1px solid var(--line);border-radius:5px;padding:3px 6px;width:240px">
        <span class="muted small">${esc(o.contact)}</span>
        <button class="btn sm spacer" data-act="addVeh" data-id="${o.id}">＋ Køretøj</button></div>
      <div style="overflow-x:auto"><table><thead><tr><th></th><th>Køretøj</th><th>Type</th><th>Siddepl.</th><th>♿ pl.</th><th>Chauffør</th><th>Telefon</th><th>Vagt fra</th><th>Vagt til</th><th>I drift</th><th></th></tr></thead><tbody>
      ${S.vehicles.filter(v => v.operatorId === o.id).map(v => `<tr>
        <td><input type="color" data-chg="veh" data-id="${v.id}" data-f="color" value="${v.color}" style="width:26px;height:24px;padding:0;border:0"></td>
        <td><input data-chg="veh" data-id="${v.id}" data-f="name" value="${esc(v.name)}" style="font-weight:600"></td>
        <td><select data-chg="veh" data-id="${v.id}" data-f="type">${['Taxa', 'Minibus', 'Liftbus'].map(t => `<option ${v.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input class="w60" type="number" min="0" data-chg="veh" data-id="${v.id}" data-f="seats" value="${v.seats}"></td>
        <td><input class="w60" type="number" min="0" data-chg="veh" data-id="${v.id}" data-f="wc" value="${v.wc}"></td>
        <td><input data-chg="veh" data-id="${v.id}" data-f="driver" value="${esc(v.driver)}"></td>
        <td><input data-chg="veh" data-id="${v.id}" data-f="phone" value="${esc(v.phone)}"></td>
        <td><input class="w80" type="time" data-chg="veh" data-id="${v.id}" data-f="start" value="${v.start}"></td>
        <td><input class="w80" type="time" data-chg="veh" data-id="${v.id}" data-f="end" value="${v.end}"></td>
        <td><input type="checkbox" data-chg="vehActive" data-id="${v.id}" ${v.active ? 'checked' : ''}></td>
        <td><button class="btn sm danger" data-act="delVeh" data-id="${v.id}">✕</button></td></tr>`).join('')}
      </tbody></table></div></div>`).join('')}</div>`;
}
CHG.op = el => { opById(el.dataset.id)[el.dataset.f] = el.value; save(); };
CHG.veh = el => { const v = vehById(el.dataset.id), f = el.dataset.f; v[f] = ['seats', 'wc'].includes(f) ? +el.value : el.value; save(); };
CHG.vehActive = el => setVehicleActive(el.dataset.id, el.checked, 'kørselskontoret');
ACT.addOp = () => { S.operators.push({ id: uid('o'), name: 'Ny vognmand', contact: '', address: '', lat: 55.67, lng: 12.43 }); save(); render(); };
ACT.addVeh = d => { S.vehicles.push({ id: uid('v'), operatorId: d.id, name: 'Nyt køretøj', type: 'Minibus', seats: 8, wc: 1, driver: '', phone: '', start: '07:00', end: '17:00', active: true, color: '#' + Math.floor(Math.random() * 0xaaaaaa).toString(16).padStart(6, '0') }); save(); render(); };
ACT.delVeh = async d => {
  if (!await ask('Slet køretøj? Ture på køretøjet bliver uplanlagte.')) return;
  S.vehicles = S.vehicles.filter(v => v.id !== d.id);
  for (const day of Object.values(S.plans)) for (const p of Object.values(day)) p.routes = p.routes.filter(r => r.vehicleId !== d.id);
  save(); render();
};
function setVehicleActive(id, on, by) {
  const v = vehById(id); v.active = on;
  let n = 0;
  for (const leg of ['ud', 'hjem']) { const p = getPlan(S.date, leg); const r = p?.routes.find(r => r.vehicleId === id); if (r) n += r.nodes.length / 2; }
  addEvent({ type: on ? 'Køretøj i drift' : 'Køretøj ude af drift', level: on ? 'info' : (n ? 'bad' : 'warn'), vehicleId: id,
    text: `${v.name} (${opById(v.operatorId).name}) er meldt ${on ? 'i drift igen' : 'ude af drift'} af ${by}.` + (!on && n ? ` ${n} ture i dag skal flyttes: åbn Planlægning og tryk "Flyt ture til andre biler".` : '') });
  save(); render();
}

/* ---------- Afvigelser ---------- */

function eventRow(e) {
  const cls = { bad: 'bad', warn: 'warn', info: 'grey' }[e.level];
  return `<div class="ev ${e.resolved ? 'resolved' : ''}"><div class="t">${hm(e.clock)}<br>${e.date !== S.date ? e.date.slice(5) : ''}</div>
    <div><span class="tag ${cls}">${esc(e.type)}</span> ${esc(e.text)}</div>
    <div>${e.level !== 'info' && !e.resolved ? `<button class="btn sm" data-act="resolve" data-id="${e.id}">✓ Løst</button>` : ''}</div></div>`;
}
function renderEvents() {
  const list = S.events.filter(e => UI.evFilter === 'all' || (UI.evFilter === 'open' ? !e.resolved && e.level !== 'info' && e.date === S.date : e.date === S.date));
  $('#v-events').innerHTML = `<div class="inner" style="max-width:960px">
    <h2>Afvigelser &amp; hændelser</h2>
    <p class="sub">Afbestillinger, forsinkelser, udeblivelser, køretøjer ude af drift og ændringer i planen. Borgere, pårørende og institutioner får automatisk besked i deres app eller portal.</p>
    <div class="seg" style="max-width:420px">
      <button data-act="evFilter" data-f="open" class="${UI.evFilter === 'open' ? 'active' : ''}">Kræver handling</button>
      <button data-act="evFilter" data-f="today" class="${UI.evFilter === 'today' ? 'active' : ''}">Alle i dag</button>
      <button data-act="evFilter" data-f="all" class="${UI.evFilter === 'all' ? 'active' : ''}">Alt</button>
    </div>
    <div class="panel">${list.length ? list.map(eventRow).join('') : '<div class="empty">Intet at vise</div>'}</div></div>`;
}
ACT.evFilter = d => { UI.evFilter = d.f; render(); };
ACT.resolve = d => { S.events.find(e => e.id === d.id).resolved = true; save(); render(); };

/* ---------- Scenarier ---------- */

function renderScenarios() {
  $('#v-scenarios').innerHTML = `<div class="inner">
    <h2>Scenarier</h2>
    <p class="sub">Simulér hvad ændrede serviceniveauer, mødetider eller vognpark betyder for antal biler og pris, før det besluttes eller sendes i udbud. Scenarierne ændrer ikke dagens plan, medmindre du vælger det.</p>
    <div class="panel"><div class="panel-head"><h3>Nyt scenarie for ${fmtDate(S.date)}</h3></div><div class="panel-body">
      <div class="form-grid" id="scenForm">
        <label class="w2">Navn<input name="name" value="Scenarie ${UI.scen.length + 1}"></label>
        <label>Kørsel<select name="leg"><option value="ud">Udkørsel</option><option value="hjem">Hjemkørsel</option></select></label>
        <label>Maks. køretid<select name="rf"><option value="0.75">75% af bevilling</option><option value="1" selected>100% (som bevilget)</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label>
        <label>Ankomstvindue (min før mødetid)<input name="win" type="number" value="${S.settings.arriveWindow}"></label>
        <label>Timepris (kr)<input name="hour" type="number" value="${S.settings.hourRate}"></label>
        <div class="row w3">${['Taxa', 'Minibus', 'Liftbus'].map(t => `<label class="check"><input type="checkbox" name="type" value="${t}" checked> ${t}</label>`).join('')}</div>
        <div class="row w3"><button class="btn primary" data-act="runScen">▶ Kør scenarie</button><span class="small muted">Tager et par sekunder</span></div>
      </div></div></div>
    <div class="panel"><div class="panel-head"><h3>Sammenligning</h3>${UI.scen.length ? '<button class="btn sm spacer" data-act="clearScen">Ryd</button>' : ''}</div>
      ${UI.scen.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Scenarie</th><th>Forudsætninger</th><th>Ture</th><th>Ikke planlagt</th><th>Biler</th><th>Km</th><th>Timer</th><th>Pris</th><th>Gns. køretid</th><th></th></tr></thead><tbody>
      ${UI.scen.map((s, i) => `<tr><td><b>${esc(s.name)}</b></td><td class="small">${esc(s.desc)}</td><td>${s.trips}</td><td>${s.un ? `<span class="tag bad">${s.un}</span>` : '0'}</td><td>${s.veh}</td><td>${num(s.km)}</td><td>${num(s.hours, 1)}</td>
        <td><b>${kr(s.cost)}</b>${i > 0 ? `<div class="small" style="color:${s.cost <= UI.scen[0].cost ? 'var(--ok)' : 'var(--bad)'}">${s.cost <= UI.scen[0].cost ? '' : '+'}${kr(s.cost - UI.scen[0].cost)}</div>` : ''}</td>
        <td>${num(s.avgRide)} min</td><td>${s.date === S.date ? `<button class="btn sm" data-act="applyScen" data-i="${i}">Brug som plan</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Kør et scenarie for at se resultatet. Det første bliver basis for sammenligningen.</div>'}
    </div></div>`;
}
ACT.runScen = () => {
  const f = $('#scenForm'), g = n => f.querySelector(`[name=${n}]`).value;
  const types = [...f.querySelectorAll('[name=type]:checked')].map(x => x.value);
  const leg = g('leg'), opts = { rideFactor: +g('rf'), arriveWindow: +g('win'), types, budget: 1500 };
  toast('Beregner scenarie…');
  setTimeout(() => {
    const oldRate = S.settings.hourRate; S.settings.hourRate = +g('hour');
    const { sol, plan, reqs } = optimiseLeg(S.date, leg, opts);
    let km = 0, hours = 0, cost = 0, rides = [], veh = 0;
    sol.routes.forEach((r, vi) => { if (!r.length) return; veh++; const s = scheduleDetail(sol.c, sol.c.V[vi], r); km += s.km; hours += (s.end - s.start) / 60; cost += s.cost; s.nodes.filter(n => n.d).forEach(n => rides.push(n.rideMin)); });
    S.settings.hourRate = oldRate;
    UI.scen.push({ name: g('name'), date: S.date, leg, plan, desc: `${LEGS[leg]} · køretid ${Math.round(opts.rideFactor * 100)}% · vindue ${opts.arriveWindow} min · ${types.join('/')} · ${g('hour')} kr/t`,
      trips: reqs.length, un: sol.un.length, veh, km, hours, cost, avgRide: rides.length ? rides.reduce((a, b) => a + b, 0) / rides.length : 0 });
    renderScenarios();
  }, 30);
};
ACT.clearScen = () => { UI.scen = []; renderScenarios(); };
ACT.applyScen = async d => {
  const s = UI.scen[+d.i]; if (!await ask(`Erstat planen for ${LEGS[s.leg].toLowerCase()} med "${s.name}"? Regler tjekkes igen med de rigtige bevillinger.`)) return;
  setPlan(S.date, s.leg, JSON.parse(JSON.stringify(s.plan)));
  addEvent({ type: 'Plan', level: 'info', text: `Scenariet "${s.name}" er taget i brug for ${LEGS[s.leg].toLowerCase()}.` });
  save(); UI.leg = s.leg; showView('plan');
};

/* ---------- Indstillinger ---------- */

function renderSettings() {
  const s = S.settings;
  const f = (k, label, step = 1) => `<label class="w2">${label}<input type="number" step="${step}" data-chg="setting" data-f="${k}" value="${s[k]}"></label>`;
  $('#v-settings').innerHTML = `<div class="inner" style="max-width:820px">
    <h2>Indstillinger</h2><p class="sub">Forudsætninger for planlægning og prisberegning.</p>
    <div class="panel"><div class="panel-head"><h3>Kørselsmodel</h3></div><div class="panel-body"><div class="form-grid">
      ${f('speed', 'Gns. hastighed (km/t)')}${f('road', 'Vejfaktor (× fugleflugt)', 0.05)}${f('arriveWindow', 'Ankomstvindue før mødetid (min)')}
    </div><p class="small muted" style="margin-top:10px">Prototypen beregner afstande som fugleflugt × vejfaktor. En rigtig løsning vil bruge en rutemotor (fx OSRM eller GraphHopper) med vejnettet og trafikdata.</p></div></div>
    <div class="panel"><div class="panel-head"><h3>Pris (afregning med vognmænd)</h3></div><div class="panel-body"><div class="form-grid">
      ${f('kmRate', 'Kr. pr. km')}${f('hourRate', 'Kr. pr. køretøjstime')}${f('startFee', 'Startgebyr pr. rute')}
    </div></div></div>
    <div class="panel"><div class="panel-head"><h3>Optimering og simulering</h3></div><div class="panel-body"><div class="form-grid">
      ${f('effortMs', 'Beregningstid pr. kørsel (ms)', 100)}
      <label class="check w3" style="align-self:end"><input type="checkbox" data-chg="autoRun" ${s.autoRun ? 'checked' : ''}> Afvikl stop automatisk når uret passerer dem (demo)</label>
    </div></div></div>
    <div class="panel"><div class="panel-head"><h3>Data</h3></div><div class="panel-body row">
      <button class="btn" data-act="resetDay">Nulstil status og forsinkelser for dagen</button>
      <button class="btn danger" data-act="resetDemo">Gendan demodata</button>
      <span class="small muted">Alt gemmes lokalt i browseren.</span></div></div></div>`;
}
CHG.setting = el => { S.settings[el.dataset.f] = +el.value; save(); toast('Gemt'); };
CHG.autoRun = el => { S.settings.autoRun = el.checked; save(); };
ACT.resetDay = () => { delete S.status[S.date]; delete S.delays[S.date]; save(); toast('Status nulstillet'); render(); };
ACT.resetDemo = async () => { if (!await ask('Slet alle ændringer og gendan demodata?')) return; localStorage.removeItem(STORE_KEY); location.reload(); };
