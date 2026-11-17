/* Institutionsportal, Vognmandsportal, Borgerapp, Chaufførapp */

/* ---------- Institutionsportal ---------- */

function tripRowsForInst(instId, leg) {
  const m = dayModel(S.date, leg), rows = [];
  for (const v of S.visitations.filter(v => v.institutionId === instId && v.days.includes(weekday(S.date)) && v[leg]))
    rows.push({ vid: v.id, c: citById(v.citizenId), time: toMin(leg === 'ud' ? v.arrive : v.leave) });
  for (const a of S.adhoc.filter(a => a.instId === instId && a.date === S.date && a.leg === leg))
    rows.push({ vid: a.id, c: citById(a.citizenId), time: toMin(a.time), adhoc: true });
  return rows.map(r => {
    const reqId = r.vid + ':' + leg, cancelled = isCancelled(r.vid, S.date, leg);
    const f = cancelled ? null : findTrip(S.date, leg, reqId);
    let status = '<span class="tag grey">Ikke planlagt endnu</span>', eta = null, veh = null;
    if (cancelled) status = '<span class="tag grey">Afbestilt</span>';
    else if (f) {
      veh = f.rt.v;
      const n = leg === 'ud' ? f.D : f.P; eta = n.eta;
      if (f.P.state === 'noshow') status = '<span class="tag bad">Ikke mødt</span>';
      else if (n.state === 'done') status = `<span class="tag ok">${leg === 'ud' ? 'Ankommet' : 'Hentet'}</span>`;
      else if (leg === 'ud' && f.P.state === 'done') status = '<span class="tag blue">I bilen</span>';
      else status = eta > r.time + (leg === 'ud' ? -1.5 : 15.5) ? '<span class="tag warn">Forsinket</span>' : '<span class="tag grey">Planlagt</span>';
    } else if (m.plan) status = '<span class="tag warn">Afventer kørselskontor</span>';
    return { ...r, cancelled, status, eta, veh, reqId };
  }).sort((a, b) => (a.eta ?? a.time) - (b.eta ?? b.time));
}

function renderInstPortal() {
  if (!instById(UI.instId)) UI.instId = S.institutions[0]?.id;
  const inst = instById(UI.instId);
  const tbl = leg => {
    const rows = tripRowsForInst(inst.id, leg);
    if (!rows.length) return '<div class="empty">Ingen kørsler</div>';
    return `<table><thead><tr><th>Borger</th><th>${leg === 'ud' ? 'Forventet ankomst' : 'Afhentes ca.'}</th><th>Køretøj</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.c.name)}</b> ${r.adhoc ? '<span class="tag blue">Enkelt</span>' : ''}<div>${needBadges(r.c)}</div></td>
        <td><b>${r.eta != null ? hm(r.eta) : '–'}</b> <span class="small muted">(${leg === 'ud' ? 'møder' : 'fri'} ${hm(r.time)})</span></td>
        <td>${r.veh ? `${dot(r.veh.color)} ${esc(r.veh.name)}<div class="small muted">${esc(r.veh.driver)}</div>` : '–'}</td>
        <td>${r.status}</td>
        <td>${r.cancelled ? `<button class="btn sm" data-act="instUndo" data-vid="${r.vid}" data-leg="${leg}">Fortryd</button>` : `<button class="btn sm" data-act="instAbsent" data-vid="${r.vid}" data-leg="${leg}">Meld fravær</button>`}</td></tr>`).join('')}
      </tbody></table>`;
  };
  const msgs = S.events.filter(e => e.instId === inst.id && e.date === S.date).slice(0, 10);
  $('#role-inst').innerHTML = `<div class="inner">
    <div class="row" style="margin-bottom:14px">
      <div><div class="muted small">INSTITUTIONSPORTAL</div><h2>${esc(inst.name)}</h2><div class="muted">${esc(inst.address)} · ${fmtDate(S.date)} · kl. ${hm(S.clock)}</div></div>
      <div class="spacer field">Logget ind som<select data-chg="instSel">${S.institutions.map(i => `<option value="${i.id}" ${i.id === inst.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></div>
    </div>
    <div class="banner blue">ℹ️ <div class="small">Her kan institutionen se hvem der kommer og hvornår, og melde fravær eller lukkedage. Kørselskontor, chauffør og pårørende får automatisk besked.</div>
      <button class="btn sm spacer" data-act="instClosed">Meld lukkedag i dag</button></div>
    <div class="grid2"><div>
      <div class="panel"><div class="panel-head"><h3>☀️ Ankomst i dag</h3></div>${tbl('ud')}</div>
      <div class="panel"><div class="panel-head"><h3>🌇 Hjemkørsel i dag</h3></div>${tbl('hjem')}</div>
    </div><div>
      <div class="panel"><div class="panel-head"><h3>Beskeder</h3></div>${msgs.length ? msgs.map(e => `<div class="ev"><div class="t">${hm(e.clock)}</div><div class="small">${esc(e.text)}</div><div></div></div>`).join('') : '<div class="empty">Ingen beskeder i dag</div>'}</div>
      <div class="panel"><div class="panel-head"><h3>Kontakt</h3></div><div class="panel-body small">Kørselskontoret · 70 00 00 00 (fiktivt)<br>Hverdage 06:30–17:00</div></div>
    </div></div></div>`;
}
CHG.instSel = el => { UI.instId = el.value; render(); };
ACT.instAbsent = d => { const r = prompt('Årsag (valgfri)', 'Syg'); if (r === null) return; cancelTrip(d.vid, S.date, d.leg === 'ud' ? 'both' : d.leg, 'Institution', r); save(); toast('Fravær meldt · kørselskontor og chauffør har fået besked'); render(); };
ACT.instUndo = d => { undoCancel(d.vid, S.date, d.leg); save(); render(); };
ACT.instClosed = () => {
  const inst = instById(UI.instId);
  const vids = S.visitations.filter(v => v.institutionId === inst.id && v.days.includes(weekday(S.date))).map(v => v.id).filter(id => !isCancelled(id, S.date, 'ud'));
  if (!vids.length) return toast('Ingen kørsler at aflyse');
  if (!confirm(`Aflys alle ${vids.length} kørsler til ${inst.name} i dag?`)) return;
  vids.forEach(id => cancelTrip(id, S.date, 'both', 'Institution', 'Lukkedag'));
  addEvent({ type: 'Lukkedag', level: 'warn', instId: inst.id, text: `${inst.name} har meldt lukkedag. ${vids.length} borgere er afbestilt ud og hjem. Overvej at optimere dagen igen for at frigøre køretøjer.` });
  save(); toast('Lukkedag meldt'); render();
};

/* ---------- Vognmandsportal ---------- */

function renderOpPortal() {
  if (!opById(UI.opId)) UI.opId = S.operators[0]?.id;
  const op = opById(UI.opId);
  const vs = S.vehicles.filter(v => v.operatorId === op.id);
  const mods = { ud: dayModel(S.date, 'ud'), hjem: dayModel(S.date, 'hjem') };
  let h = 0, km = 0, cost = 0, trips = 0;
  const cards = vs.map(v => {
    const legs = ['ud', 'hjem'].map(leg => {
      const m = mods[leg], rt = m.routes.find(r => r.v.id === v.id);
      if (!rt || !rt.codes.length) return `<div class="small muted" style="padding:6px 0">${LEGS[leg]}: ingen kørsel</div>`;
      const lv = liveRoute(m, rt);
      h += (rt.sched.end - rt.sched.start) / 60; km += rt.sched.km; cost += rt.sched.cost; trips += rt.codes.length / 2;
      const open = UI.open.has('op' + v.id + leg);
      return `<div style="border-top:1px solid var(--line);padding:8px 0">
        <div class="row"><b>${LEGS[leg]}</b> <span class="muted">${hm(lv.start)}–${hm(lv.end)} · ${rt.codes.length / 2} borgere · ${num(rt.sched.km, 1)} km</span>
          ${lv.delay ? `<span class="tag warn">+${lv.delay} min</span>` : ''}<span class="tag ${lv.phase === 'Afsluttet' ? 'ok' : lv.phase === 'Kører' ? 'blue' : 'grey'}">${lv.phase}</span>
          <button class="btn sm spacer" data-act="toggleRoute" data-id="op${v.id}${leg}">${open ? 'Skjul' : 'Vis'} køreseddel</button></div>
        ${open ? `<table style="margin-top:6px"><thead><tr><th>Tid</th><th></th><th>Borger</th><th>Adresse</th><th>Behov</th></tr></thead><tbody>
          ${lv.nodes.map(n => { const c = citById(n.req.citizenId); return `<tr><td><b>${hm(n.eta)}</b></td><td>${n.d ? '↓ Aflever' : '↑ Hent'}</td><td>${esc(c.name)}</td><td class="small">${placeName(n.req, n.d)}</td><td>${n.d ? '' : needBadges(c)}</td></tr>`; }).join('')}
          </tbody></table>` : ''}
      </div>`;
    }).join('');
    return `<div class="vcard ${v.active ? '' : 'off'}"><div class="panel-head">${dot(v.color)} <b>${esc(v.name)}</b> <span class="muted small">${esc(v.type)} · ${v.seats} pl. · ${v.wc} ♿ · vagt ${v.start}–${v.end}</span>
      <span class="spacer small muted">Chauffør</span><input data-chg="veh" data-id="${v.id}" data-f="driver" value="${esc(v.driver)}" style="border:1px solid var(--line);border-radius:5px;padding:3px 6px;width:140px">
      ${v.active ? `<button class="btn sm danger" data-act="opVehOff" data-id="${v.id}">Meld ude af drift</button>` : `<span class="tag bad">Ude af drift</span><button class="btn sm" data-act="opVehOn" data-id="${v.id}">Meld i drift</button>`}</div>
      <div style="padding:0 16px 6px">${legs}</div></div>`;
  }).join('');
  const acc = S.accepted[S.date]?.[op.id];
  $('#role-op').innerHTML = `<div class="inner">
    <div class="row" style="margin-bottom:14px">
      <div><div class="muted small">VOGNMANDSPORTAL</div><h2>${esc(op.name)}</h2><div class="muted">${esc(op.address)} · ${fmtDate(S.date)}</div></div>
      <div class="spacer field">Logget ind som<select data-chg="opSel">${S.operators.map(o => `<option value="${o.id}" ${o.id === op.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div>
    </div>
    <div class="kpis">
      <div class="kpi"><b>${trips}</b><span>Borgerture</span></div><div class="kpi"><b>${num(h, 1)}</b><span>Køretøjstimer</span></div>
      <div class="kpi"><b>${num(km)}</b><span>Km</span></div><div class="kpi"><b>${kr(cost)}</b><span>Forventet afregning</span></div>
      <div class="kpi small-k"><b>${acc ? '✓ Kl. ' + hm(acc) : '–'}</b><span>Kørsler bekræftet</span></div>
    </div>
    <div class="banner ${acc ? 'blue' : 'warn'}">${acc ? '✅' : '📨'} <div class="small">${acc ? 'I har bekræftet dagens kørsler. Ændringer fra kørselskontoret vises her og i chaufførappen.' : 'Kørselskontoret har sendt dagens kørsler. Tjek køresedler og chauffører og bekræft.'}</div>
      ${acc ? '' : '<button class="btn green spacer" data-act="opAccept">Bekræft dagens kørsler</button>'}</div>
    ${cards}</div>`;
}
CHG.opSel = el => { UI.opId = el.value; render(); };
ACT.opVehOff = d => { if (!confirm('Meld køretøjet ude af drift? Kørselskontoret får besked og flytter turene.')) return; setVehicleActive(d.id, false, 'vognmanden'); toast('Kørselskontoret har fået besked'); };
ACT.opVehOn = d => setVehicleActive(d.id, true, 'vognmanden');
ACT.opAccept = () => { (S.accepted[S.date] ||= {})[UI.opId] = S.clock; addEvent({ type: 'Bekræftet', level: 'info', text: `${opById(UI.opId).name} har bekræftet dagens kørsler.` }); save(); render(); };

/* ---------- Borgerapp ---------- */

function tripStatus(date, t) {
  const reqId = t.vid + ':' + t.leg;
  if (t.cancelled) return { text: 'Afbestilt', tag: 'grey' };
  const f = findTrip(date, t.leg, reqId);
  if (!f) return { text: date === S.date && getPlan(date, t.leg) ? 'Afventer planlægning' : 'Tidspunkt fastlægges dagen før', tag: 'grey' };
  const { P, D, rt, live } = f;
  if (P.state === 'noshow') return { text: 'Registreret som ikke mødt', tag: 'bad', f };
  if (D.state === 'done') return { text: `Afleveret kl. ${hm(D.at ?? D.eta)}`, tag: 'ok', f };
  if (P.state === 'done') return { text: `I bilen · fremme ca. ${hm(D.eta)}`, tag: 'blue', big: `Fremme ca. ${hm(D.eta)}`, f };
  const mins = Math.round(P.eta - S.clock);
  if (date === S.date && live.phase === 'Kører' && mins <= 20 && mins >= 0) return { text: `Bilen er på vej · ca. ${mins} min`, tag: 'blue', big: `Ca. ${mins} min`, f };
  return { text: `Afhentning ca. ${hm(P.eta)} (±10 min)`, tag: live.delay ? 'warn' : 'grey', big: hm(P.eta), f };
}

function renderCitizenApp() {
  if (!citById(UI.citizenId)) UI.citizenId = S.citizens[0]?.id;
  const c = citById(UI.citizenId);
  const today = citizenTrips(c.id, S.date).map(t => ({ ...t, st: tripStatus(S.date, t) }));
  const nextT = today.find(t => !t.cancelled && !['ok', 'bad'].includes(t.st.tag));
  const upcoming = [];
  for (let i = 1; i <= 7; i++) { const d = addDays(S.date, i); for (const t of citizenTrips(c.id, d)) upcoming.push({ ...t, d }); }
  const msgs = S.events.filter(e => e.citizenIds?.includes(c.id)).slice(0, 12);
  const vis = S.visitations.find(v => v.citizenId === c.id);
  const tripLine = (t, d) => `<div class="trip"><div class="d">${DAY_SHORT[weekday(d)]}<b>${dateObj(d).getDate()}</b></div>
    <div style="flex:1">${t.leg === 'ud' ? '☀️ Til' : '🌇 Hjem fra'} ${esc(instById(t.instId)?.name)}<div class="small muted">${t.leg === 'ud' ? 'Møder' : 'Fri'} ${hm(t.time)}${d === S.date ? ' · ' + t.st.text : ''}</div></div>
    ${t.cancelled ? `<button class="btn sm" data-act="citUndo" data-vid="${t.vid}" data-leg="${t.leg}" data-d="${d}">Fortryd</button>` : (d === S.date && t.st.tag === 'ok') ? '' : `<button class="btn sm danger" data-act="citCancel" data-vid="${t.vid}" data-leg="${t.leg}" data-d="${d}">Afbestil</button>`}</div>`;
  let body = '';
  if (UI.citTab === 'trips') {
    body = `${nextT ? `<div class="card" style="border:2px solid var(--brand)"><h4>Næste kørsel · ${nextT.leg === 'ud' ? 'til ' + esc(instById(nextT.instId).name) : 'hjem'}</h4>
        <div class="big-status">${nextT.st.big || '–'}</div><div>${nextT.st.text}</div>
        ${nextT.st.f ? `<div class="small muted" style="margin-top:6px">${dot(nextT.st.f.rt.v.color)} ${esc(nextT.st.f.rt.v.name)} · chauffør ${esc(nextT.st.f.rt.v.driver)}${nextT.st.f.live.delay ? ` · <b style="color:var(--warn)">ca. ${nextT.st.f.live.delay} min forsinket</b>` : ''}</div>` : ''}</div>`
      : `<div class="card"><h4>I dag</h4>${today.length ? 'Ingen flere kørsler i dag' : 'Ingen kørsler i dag'}</div>`}
      ${today.length ? `<div class="card"><h4>I dag · ${fmtDate(S.date, false)}</h4>${today.map(t => tripLine(t, S.date)).join('')}</div>` : ''}
      <div class="card"><h4>Kommende kørsler</h4>${upcoming.length ? upcoming.slice(0, 10).map(t => tripLine(t, t.d)).join('') : '<div class="small muted">Ingen</div>'}</div>`;
  } else if (UI.citTab === 'msgs') {
    body = `<div class="card"><h4>Beskeder</h4>${msgs.length ? msgs.map(e => `<div class="msg"><small>${e.date === S.date ? 'I dag' : e.date} kl. ${hm(e.clock)} · ${esc(e.type)}</small>${esc(citizenText(e, c))}</div>`).join('') : '<div class="small muted">Ingen beskeder</div>'}</div>`;
  } else {
    body = `<div class="card"><h4>Mine oplysninger</h4><b>${esc(c.name)}</b><div class="small muted">${esc(c.address)}</div><div style="margin-top:6px">${needBadges(c) || '<span class="small muted">Ingen særlige behov registreret</span>'}</div></div>
      ${vis ? `<div class="card"><h4>Min bevilling</h4>${esc(vis.type)} til <b>${esc(instById(vis.institutionId)?.name)}</b><div class="small" style="margin-top:4px">${vis.days.map(d => DAY_SHORT[d]).join(', ')} · møder ${vis.arrive} · hjem ${vis.leave}<br>Maks. ${vis.maxRide} min i bilen</div></div>` : ''}
      <div class="card"><h4>Pårørende</h4>${esc(c.relative || '–')}</div>
      <div class="card small muted">Spørgsmål? Ring til kørselskontoret på 70 00 00 00 (fiktivt).</div>`;
  }
  $('#role-citizen').innerHTML = `
    <div class="phone-side"><div class="muted small">BORGERAPP</div><h2>Borger og pårørende</h2>
      <p class="sub">Borgeren eller de pårørende kan se hvornår bilen kommer, følge den live og afbestille. Prøv at afspille uret, eller afbestil en tur og se den forsvinde fra chaufførens rute.</p>
      <div class="field">Logget ind som<select data-chg="citSel">${S.citizens.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
    <div class="phone">
      <div class="ph-top"><small>${fmtDate(S.date)} · ${hm(S.clock)}</small><h3>Hej ${esc(c.name.split(' ')[0])} 👋</h3></div>
      <div class="ph-tabs">${[['trips', 'Kørsler'], ['msgs', `Beskeder${msgs.length ? ' (' + msgs.length + ')' : ''}`], ['me', 'Mig']].map(([k, l]) => `<button data-act="citTab" data-t="${k}" class="${UI.citTab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="ph-body">${body}</div>
    </div>`;
}
// Plain language version of an event for the citizen
function citizenText(e, c) {
  if (e.type === 'Forsinkelse') return `Din kørsel med ${vehById(e.vehicleId)?.name || 'bilen'} er forsinket. Vi beklager. Følg bilen under Kørsler.`;
  if (e.type === 'Afbestilling') return `Din kørsel er afbestilt. ${e.text.includes('institution') ? 'Afbestilt af institutionen.' : ''}`;
  if (e.type === 'Ikke mødt') return 'Chaufføren kunne ikke hente dig og har kørt videre. Kontakt kørselskontoret hvis du stadig skal køres.';
  return e.text;
}
CHG.citSel = el => { UI.citizenId = el.value; render(); };
ACT.citTab = d => { UI.citTab = d.t; render(); };
ACT.citCancel = d => {
  const t = citizenTrips(UI.citizenId, d.d).find(t => t.vid === d.vid && t.leg === d.leg);
  if (d.d === S.date) { const st = tripStatus(d.d, t); if (st.f && st.f.P.eta - S.clock < 60 && !confirm('Der er under en time til afhentning. Afbestil alligevel?')) return; }
  else if (!confirm(`Afbestil ${t.leg === 'ud' ? 'udkørsel' : 'hjemkørsel'} ${fmtDate(d.d)}?`)) return;
  cancelTrip(d.vid, d.d, d.leg, 'Borger', ''); save(); toast('Kørslen er afbestilt'); render();
};
ACT.citUndo = d => { undoCancel(d.vid, d.d, d.leg); save(); toast('Kørslen er bestilt igen'); render(); };

/* ---------- Chaufførapp ---------- */

function renderDriverApp() {
  if (!vehById(UI.vehicleId)) UI.vehicleId = S.vehicles[0]?.id;
  const v = vehById(UI.vehicleId);
  const m = dayModel(S.date, UI.driverLeg), rt = m.routes.find(r => r.v.id === v.id);
  const lv = rt && rt.codes.length ? liveRoute(m, rt) : null;
  let body = '';
  if (!lv) body = `<div class="empty">Ingen ${LEGS[UI.driverLeg].toLowerCase()} i dag.<br>Kørselskontoret har ikke tildelt ture til ${esc(v.name)}.</div>`;
  else {
    const cur = lv.next;
    body = `<div class="small muted" style="padding:0 4px 8px">🅿 Afgang fra garage ${hm(lv.start)}</div>` + lv.nodes.map((n, i) => {
      const c = citById(n.req.citizenId), r = n.req;
      const cls = n.state === 'pending' ? (n === cur ? 'current' : '') : n.state;
      const p = n.d ? r.drop : r.pick;
      const stTxt = { done: n.d ? 'Afleveret' : 'Hentet', noshow: 'Ikke mødt', skipped: 'Udgår' }[n.state];
      return `<div class="job ${cls}">
        <div class="jt"><span class="kind" style="color:${n.d ? 'var(--ok)' : 'var(--brand)'}">${n.d ? '↓ AFLEVER' : '↑ HENT'}</span><b>${hm(n.eta)}</b></div>
        <div class="jt"><b style="font-size:15px">${esc(c.name)}</b>${stTxt ? `<span class="tag ${n.state === 'done' ? 'ok' : 'bad'}">${stTxt}</span>` : ''}</div>
        <div class="addr">${placeName(r, n.d)}</div>
        ${!n.d ? `<div>${needBadges(c)}</div>${c.note ? `<div class="note">📝 ${esc(c.note)}</div>` : ''}<div class="small muted">Pårørende: ${esc(c.relative || '–')}</div>` : ''}
        ${n.state === 'pending' ? `<div class="acts">
          <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">🧭</a>
          ${n.d ? `<button class="btn green" data-act="drvDone" data-req="${r.id}" data-k="D">✓ Afleveret</button>`
               : `<button class="btn green" data-act="drvDone" data-req="${r.id}" data-k="P">✓ Hentet</button><button class="btn danger" data-act="drvNoShow" data-req="${r.id}">Ikke mødt</button>`}
        </div>` : (n.state === 'done' || n.state === 'noshow') && statusOf(S.date, r.id)[n.d ? 'D' : 'P'] ? `<div class="acts"><button class="btn" data-act="drvUndo" data-req="${r.id}" data-k="${n.d ? 'D' : 'P'}">Fortryd</button></div>` : ''}
      </div>`;
    }).join('') + `<div class="small muted" style="padding:4px">🅿 Retur i garage ca. ${hm(lv.end)}</div>`;
  }
  $('#role-driver').innerHTML = `
    <div class="phone-side"><div class="muted small">CHAUFFØRAPP</div><h2>Chauffør</h2>
      <p class="sub">Installeres på chaufførens telefon eller tablet. Viser dagens køreseddel med borgernes behov. Hentet, afleveret, ikke mødt og forsinkelser går direkte til kørselskontoret.</p>
      <div class="field">Køretøj<select data-chg="drvSel">${S.vehicles.map(x => `<option value="${x.id}" ${x.id === v.id ? 'selected' : ''}>${esc(x.name)} · ${esc(x.driver)}</option>`).join('')}</select></div></div>
    <div class="phone">
      <div class="ph-top"><small>${fmtDate(S.date)} · ${hm(S.clock)}</small><h3>${esc(v.name)} · ${esc(v.driver.split(' ')[0])}</h3>
        <div class="prog"><div style="width:${lv ? lv.doneN / lv.nodes.length * 100 : 0}%"></div></div>
        <small>${lv ? `${lv.doneN} af ${lv.nodes.length} stop · ${lv.onboard} i bilen${lv.delay ? ` · <b style="color:#ffd27a">+${lv.delay} min</b>` : ''}` : ''}</small></div>
      <div class="ph-tabs">${['ud', 'hjem'].map(l => `<button data-act="drvLeg" data-l="${l}" class="${UI.driverLeg === l ? 'active' : ''}">${l === 'ud' ? '☀️ Morgen' : '🌇 Eftermiddag'}</button>`).join('')}</div>
      <div class="ph-body">${body}</div>
      ${lv ? `<div class="ph-foot">Meld forsinkelse: ${[5, 10, 15].map(x => `<button class="btn sm" data-act="delay" data-id="${v.id}" data-leg="${UI.driverLeg}" data-min="${x}" data-by="chaufføren">+${x}</button>`).join('')}</div>` : ''}
    </div>`;
}
CHG.drvSel = el => { UI.vehicleId = el.value; render(); };
ACT.drvLeg = d => { UI.driverLeg = d.l; render(); };
ACT.drvDone = d => { setStatus(S.date, d.req, { [d.k]: 'done', [d.k + 't']: S.clock }); save(); render(); };
ACT.drvUndo = d => { setStatus(S.date, d.req, { [d.k]: null, [d.k + 't']: null }); save(); render(); };
ACT.drvNoShow = d => {
  if (!confirm('Registrér at borgeren ikke var klar? Kørselskontor, pårørende og institution får besked.')) return;
  setStatus(S.date, d.req, { P: 'noshow', Pt: S.clock });
  const leg = d.req.split(':').pop(), m = dayModel(S.date, leg), r = m.reqs[m.c.idx.get(d.req)], c = citById(r.citizenId);
  addEvent({ type: 'Ikke mødt', level: 'warn', citizenIds: [c.id], instId: r.instId, vehicleId: UI.vehicleId,
    text: `${c.name} var ikke klar til afhentning (${vehById(UI.vehicleId).name} kl. ${hm(S.clock)}). Chaufføren er kørt videre. Pårørende (${c.relative}) og ${instById(r.instId).name} er orienteret.` });
  save(); render();
};
