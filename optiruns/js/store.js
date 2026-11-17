/* State, trip generation, plans, events and live status. */

const STORE_KEY = 'turplan.v1';
let S = null;
let REV = 0;

function save() { REV++; localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
function saveQuiet() { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
function loadState() {
  try { S = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { S = null; }
  if (!S || S.version !== 1) { S = makeDemo(); save(); }
}

const citById = id => S.citizens.find(c => c.id === id);
const instById = id => S.institutions.find(i => i.id === id);
const opById = id => S.operators.find(o => o.id === id);
const vehById = id => S.vehicles.find(v => v.id === id);

/* ---------- Trips (requests) ---------- */

const LEGS = { ud: 'Udkørsel', hjem: 'Hjemkørsel' };
const LEG_LONG = { ud: 'Udkørsel (morgen)', hjem: 'Hjemkørsel (eftermiddag)' };

function makeReq(vid, c, inst, leg, time, maxRide, type, opts = {}) {
  const home = { lat: c.lat, lng: c.lng }, place = { lat: inst.lat, lng: inst.lng };
  const pick = leg === 'ud' ? home : place, drop = leg === 'ud' ? place : home;
  const direct = travelMin(pick, drop);
  const factor = opts.rideFactor || 1;
  const ride = Math.max(maxRide * factor, Math.ceil(direct * 1.25) + 5);
  const win = opts.arriveWindow ?? S.settings.arriveWindow;
  const svc = c.wheelchair ? 5 : 2;
  let pe, pl, de, dl;
  if (leg === 'ud') { de = time - win; dl = time - 2; pe = time - ride - 30; pl = dl - direct - svc; }
  else { pe = time; pl = time + 15; de = time; dl = time + 15 + svc + ride; }
  return {
    id: vid + ':' + leg, vid, leg, citizenId: c.id, instId: inst.id, type, time,
    pick, drop, pe, pl, de, dl, ride, direct, svc,
    seats: (c.wheelchair ? 0 : 1) + (c.escort ? 1 : 0), wc: c.wheelchair ? 1 : 0,
    alone: !!c.alone, onlyVehicle: c.knownVehicleId || null,
  };
}

function isCancelled(vid, date, leg) {
  return S.cancellations.some(x => x.vid === vid && x.date === date && (x.leg === leg || x.leg === 'both'));
}

function buildRequests(date, leg, opts = {}) {
  const wd = weekday(date), out = [];
  for (const v of S.visitations) {
    if (!v.days.includes(wd) || !v[leg]) continue;
    if (isCancelled(v.id, date, leg)) continue;
    const c = citById(v.citizenId), inst = instById(v.institutionId);
    if (!c || !inst) continue;
    out.push(makeReq(v.id, c, inst, leg, toMin(leg === 'ud' ? v.arrive : v.leave), +v.maxRide, v.type, opts));
  }
  for (const a of S.adhoc) {
    if (a.date !== date || a.leg !== leg || isCancelled(a.id, date, leg)) continue;
    const c = citById(a.citizenId), inst = instById(a.instId);
    if (!c || !inst) continue;
    out.push(makeReq(a.id, c, inst, leg, toMin(a.time), 45, 'Enkeltkørsel', opts));
  }
  return out;
}

// Every trip a citizen has on a date (cancelled ones included), used by the apps
function citizenTrips(citizenId, date) {
  const wd = weekday(date), out = [];
  for (const v of S.visitations.filter(v => v.citizenId === citizenId && v.days.includes(wd)))
    for (const leg of ['ud', 'hjem']) if (v[leg]) out.push({ vid: v.id, leg, instId: v.institutionId, time: toMin(leg === 'ud' ? v.arrive : v.leave), type: v.type, cancelled: isCancelled(v.id, date, leg) });
  for (const a of S.adhoc.filter(a => a.citizenId === citizenId && a.date === date))
    out.push({ vid: a.id, leg: a.leg, instId: a.instId, time: toMin(a.time), type: 'Enkeltkørsel', cancelled: isCancelled(a.id, date, a.leg) });
  return out.sort((a, b) => a.time - b.time);
}

/* ---------- Plans ---------- */

const getPlan = (date, leg) => S.plans[date]?.[leg] || null;
function setPlan(date, leg, plan) { (S.plans[date] ||= {})[leg] = plan; }

// Everything a view needs for one date + leg. Cached until state changes.
const _modelCache = new Map();
function dayModel(date, leg) {
  const key = date + '|' + leg + '|' + REV;
  if (_modelCache.has(key)) return _modelCache.get(key);
  if (_modelCache.size > 20) _modelCache.clear();
  const reqs = buildRequests(date, leg);
  const c = buildCtx(reqs, S.vehicles, leg);
  const plan = getPlan(date, leg);
  const sol = plan ? planToSol(c, plan) : null;
  const routes = [];
  const planned = new Set();
  if (sol) sol.routes.forEach((codes, vi) => {
    const v = S.vehicles[vi];
    const sched = scheduleDetail(c, c.V[vi], codes);
    if (!v.active && codes.length) sched.issues.unshift('Køretøj meldt ude af drift');
    codes.forEach(code => planned.add(code >> 1));
    routes.push({ v, vi, codes, sched });
  });
  const unplanned = reqs.filter((_, k) => !planned.has(k));
  const used = routes.filter(r => r.codes.length);
  const totals = {
    trips: reqs.length, planned: planned.size, vehicles: used.length,
    km: used.reduce((a, r) => a + r.sched.km, 0),
    hours: used.reduce((a, r) => a + (r.sched.end - r.sched.start) / 60, 0),
    cost: used.reduce((a, r) => a + r.sched.cost, 0),
    issues: used.reduce((a, r) => a + r.sched.issues.length, 0),
  };
  const m = { date, leg, reqs, c, plan, routes, unplanned, totals };
  _modelCache.set(key, m);
  return m;
}

/* ---------- Events, notifications ---------- */

function addEvent(e) {
  S.events.unshift({ id: uid('e'), at: Date.now(), date: S.date, clock: S.clock, resolved: false, level: 'info', citizenIds: [], ...e });
  if (S.events.length > 400) S.events.length = 400;
}
const openEvents = () => S.events.filter(e => !e.resolved && e.level !== 'info' && e.date === S.date);

/* ---------- Cancellations ---------- */

function cancelTrip(vid, date, leg, by, reason) {
  S.cancellations.push({ id: uid('x'), vid, date, leg, by, reason, at: Date.now() });
  const legs = leg === 'both' ? ['ud', 'hjem'] : [leg];
  let removedFrom = [];
  for (const L of legs) {
    const p = getPlan(date, L); if (!p) continue;
    for (const r of p.routes) {
      const before = r.nodes.length;
      r.nodes = r.nodes.filter(n => n.r !== vid + ':' + L);
      if (r.nodes.length !== before) removedFrom.push(vehById(r.vehicleId)?.name);
    }
  }
  const owner = S.visitations.find(v => v.id === vid) || S.adhoc.find(a => a.id === vid);
  const c = citById(owner?.citizenId);
  const instId = owner?.institutionId || owner?.instId;
  addEvent({
    type: 'Afbestilling', level: 'info', date, citizenIds: [c?.id], instId,
    text: `${c?.name} er afbestilt (${leg === 'both' ? 'ud og hjem' : LEGS[leg].toLowerCase()}) af ${by.toLowerCase()}${reason ? ': ' + reason : ''}.` +
      (removedFrom.length ? ` Fjernet fra ${removedFrom.join(', ')}; chaufføren har fået besked.` : ''),
  });
}
function undoCancel(vid, date, leg) {
  S.cancellations = S.cancellations.filter(x => !(x.vid === vid && x.date === date && (x.leg === leg || x.leg === 'both')));
  const owner = S.visitations.find(v => v.id === vid) || S.adhoc.find(a => a.id === vid);
  const c = citById(owner?.citizenId);
  const hasPlan = getPlan(date, leg);
  addEvent({ type: 'Genbestilling', level: hasPlan ? 'warn' : 'info', date, citizenIds: [c?.id], instId: owner?.institutionId || owner?.instId,
    text: `${c?.name} skal alligevel køres (${LEGS[leg].toLowerCase()}).` + (hasPlan ? ' Turen er ikke på en rute endnu: indsæt den i planen.' : '') });
}

/* ---------- Live status ---------- */

const statusOf = (date, reqId) => S.status[date]?.[reqId] || {};
function setStatus(date, reqId, patch) { const d = (S.status[date] ||= {}); d[reqId] = { ...(d[reqId] || {}), ...patch }; }
const getDelay = (date, leg, vid) => S.delays[date]?.[leg]?.[vid] || 0;
function setDelay(date, leg, vid, min) { ((S.delays[date] ||= {})[leg] ||= {})[vid] = min; }

// Route with ETA and state per stop, at the current simulated clock
function liveRoute(m, rt) {
  const delay = getDelay(m.date, m.leg, rt.v.id);
  const auto = S.settings.autoRun && m.date === S.date;
  const now = S.clock;
  const nodes = rt.sched.nodes.map(n => {
    const req = m.reqs[n.k], s = statusOf(m.date, req.id);
    const eta = n.B + delay;
    let state = 'pending';
    if (s.P === 'noshow') state = n.d ? 'skipped' : 'noshow';
    else if ((n.d ? s.D : s.P) === 'done') state = 'done';
    else if (auto && now >= eta + req.svc) state = 'done';
    return { ...n, req, eta, state, at: n.d ? s.Dt : s.Pt };
  });
  const next = nodes.find(n => n.state === 'pending');
  const doneN = nodes.filter(n => n.state !== 'pending').length;
  const onboard = nodes.filter(n => !n.d && n.state === 'done' && nodes.find(x => x.d && x.k === n.k)?.state === 'pending').length;
  const start = rt.sched.start + delay, end = rt.sched.end + delay;
  let phase = 'Ikke startet';
  if (!nodes.length) phase = 'Ingen ture';
  else if (!next) phase = 'Afsluttet';
  else if (now >= start || doneN) phase = 'Kører';
  // position: interpolate between previous and next point in the timeline
  let pos = null;
  if (nodes.length && m.date === S.date && now > start && now < end) {
    const base = opById(rt.v.operatorId);
    const pts = [{ t: start, p: base }, ...nodes.map(n => ({ t: n.eta, p: n.d ? n.req.drop : n.req.pick, svc: n.req.svc })), { t: end, p: base }];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], leave = a.t + (a.svc || 0);
      if (now >= a.t && now < b.t) {
        if (now <= leave) pos = a.p;
        else { const f = Math.min(1, (now - leave) / Math.max(1, b.t - leave)); pos = { lat: a.p.lat + (b.p.lat - a.p.lat) * f, lng: a.p.lng + (b.p.lng - a.p.lng) * f }; }
        break;
      }
    }
  }
  return { nodes, next, delay, onboard, doneN, phase, pos, start, end };
}

// Where is a given trip right now? Used by the citizen app and the institution portal
function findTrip(date, leg, reqId) {
  const m = dayModel(date, leg);
  for (const rt of m.routes) {
    if (!rt.codes.length) continue;
    const live = liveRoute(m, rt);
    const P = live.nodes.find(n => n.req.id === reqId && !n.d), D = live.nodes.find(n => n.req.id === reqId && n.d);
    if (P) return { rt, live, P, D, m };
  }
  return null;
}
