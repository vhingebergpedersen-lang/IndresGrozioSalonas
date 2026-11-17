/* Route optimiser for passenger transport (a "dial a ride" problem).

   Each trip is a pickup + drop-off pair. Rules:
   - drop-off at the institution inside the arrival window (before start time)
   - pickup at the institution inside the pickup window (after it closes)
   - max ride time per citizen (service level from the approval)
   - seats and wheelchair places in the vehicle, escorts take a seat
   - "enekørsel": nobody else on board while that citizen rides
   - "fast chauffør": the trip can only go on one specific vehicle
   - vehicle shift hours

   Method: cheapest insertion, then local search (move a trip to its best
   place, empty out small routes), repeated with different start orders.
   The cost is what a municipality typically pays: km + vehicle hours + a
   start fee per vehicle used.

   Route encoding: a route is an array of codes. Trip k has code 2k (pickup)
   and 2k+1 (drop-off). */

const LEG_WIN = { ud: [0, toMin('12:30')], hjem: [toMin('11:30'), 24 * 60] };

function buildCtx(reqs, vehicles, leg) {
  const bases = [], baseIdx = new Map();
  const V = vehicles.map(v => {
    const op = opById(v.operatorId);
    if (!baseIdx.has(op.id)) { baseIdx.set(op.id, bases.length); bases.push({ lat: op.lat, lng: op.lng }); }
    return { id: v.id, seats: +v.seats, wc: +v.wc, active: v.active, b: baseIdx.get(op.id),
      s: Math.max(toMin(v.start), LEG_WIN[leg][0]), e: Math.min(toMin(v.end), LEG_WIN[leg][1]) };
  });
  const pts = bases.slice();
  for (const r of reqs) pts.push(r.pick, r.drop);
  const n = pts.length, T = [], K = [];
  for (let i = 0; i < n; i++) {
    T.push(new Float64Array(n)); K.push(new Float64Array(n));
    for (let j = 0; j < n; j++) { const km = i === j ? 0 : travelKm(pts[i], pts[j]); K[i][j] = km; T[i][j] = km / S.settings.speed * 60; }
  }
  return { R: reqs, V, T, K, nB: bases.length, pts, pd: new Float64Array(reqs.length),
    rates: { km: +S.settings.kmRate, hour: +S.settings.hourRate, start: +S.settings.startFee },
    idx: new Map(reqs.map((r, i) => [r.id, i])) };
}

// One forward pass. Returns null if any rule is broken.
function pass(c, v, route, t0, checkRide) {
  let t = t0, prev = v.b, km = 0, W = 0, F = Infinity, seats = 0, wc = 0, on = 0, al = 0;
  for (let i = 0; i < route.length; i++) {
    const code = route[i], k = code >> 1, d = code & 1, r = c.R[k], p = c.nB + code;
    t += c.T[prev][p]; km += c.K[prev][p]; prev = p;
    const e = d ? r.de : r.pe, l = d ? r.dl : r.pl;
    if (t < e) { W += e - t; t = e; }
    if (t > l + 1e-9) return null;
    const f = W + l - t; if (f < F) F = f;
    if (!d) {
      if (r.onlyVehicle && r.onlyVehicle !== v.id) return null;
      seats += r.seats; wc += r.wc; on++; if (r.alone) al++;
      if (seats > v.seats || wc > v.wc || (al && on > 1)) return null;
      t += r.svc; c.pd[k] = t;
    } else {
      if (checkRide && t - c.pd[k] > r.ride + 1e-9) return null;
      seats -= r.seats; wc -= r.wc; on--; if (r.alone) al--;
      t += r.svc;
    }
  }
  t += c.T[prev][v.b]; km += c.K[prev][v.b];
  if (t > v.e + 1e-9) return null;
  return { km, start: t0, end: t, D: Math.max(0, Math.min(F, W)) };
}

const EMPTY = { km: 0, start: 0, end: 0, cost: 0 };
function evalRoute(c, v, route) {
  if (!route.length) return EMPTY;
  const a = pass(c, v, route, v.s, false); if (!a) return null;
  // leave the garage as late as possible: removes waiting, shortens ride times and paid hours
  const b = pass(c, v, route, v.s + a.D, true); if (!b) return null;
  b.cost = b.km * c.rates.km + (b.end - b.start) / 60 * c.rates.hour + c.rates.start;
  return b;
}

function bestInsert(c, sol, k, skipVi = -1) {
  const r = c.R[k]; let best = null;
  for (let vi = 0; vi < c.V.length; vi++) {
    const v = c.V[vi];
    if (vi === skipVi || !v.active || r.wc > v.wc || r.seats > v.seats) continue;
    if (r.onlyVehicle && r.onlyVehicle !== v.id) continue;
    const route = sol.routes[vi], base = sol.costs[vi], n = route.length;
    for (let i = 0; i <= n; i++) {
      for (let j = i; j <= n; j++) {
        const nr = route.slice(0, i); nr.push(2 * k);
        for (let x = i; x < j; x++) nr.push(route[x]);
        nr.push(2 * k + 1);
        for (let x = j; x < n; x++) nr.push(route[x]);
        const e = evalRoute(c, v, nr); if (!e) continue;
        const d = e.cost - base;
        if (!best || d < best.d) best = { vi, nr, e, d };
      }
    }
  }
  return best;
}
function applyIns(sol, b) { sol.routes[b.vi] = b.nr; sol.costs[b.vi] = b.e.cost; }
const solCost = sol => sol.costs.reduce((a, b) => a + b, 0);

function construct(c, order) {
  const sol = { routes: c.V.map(() => []), costs: c.V.map(() => 0), un: [] };
  for (const k of order) { const b = bestInsert(c, sol, k); if (b) applyIns(sol, b); else sol.un.push(k); }
  return sol;
}

function eliminate(c, sol) {
  const order = sol.routes.map((r, i) => [r.length, i]).filter(x => x[0] > 0).sort((a, b) => a[0] - b[0]);
  for (const [, vi] of order.slice(0, 3)) {
    const snapR = sol.routes.map(r => r.slice()), snapC = sol.costs.slice(), before = solCost(sol);
    const ks = [...new Set(sol.routes[vi].map(x => x >> 1))];
    sol.routes[vi] = []; sol.costs[vi] = 0;
    let ok = true;
    for (const k of ks) { const b = bestInsert(c, sol, k, vi); if (!b) { ok = false; break; } applyIns(sol, b); }
    if (ok && solCost(sol) < before - 1e-6) return true;
    sol.routes = snapR; sol.costs = snapC;
  }
  return false;
}

function improve(c, sol, deadline) {
  for (let round = 0; round < 8; round++) {
    let any = false;
    for (let u = sol.un.length - 1; u >= 0; u--) { const b = bestInsert(c, sol, sol.un[u]); if (b) { applyIns(sol, b); sol.un.splice(u, 1); any = true; } }
    for (let vi = 0; vi < sol.routes.length; vi++) {
      for (const k of [...new Set(sol.routes[vi].map(x => x >> 1))]) {
        const old = sol.routes[vi], oc = sol.costs[vi];
        const wo = old.filter(x => (x >> 1) !== k);
        const ew = evalRoute(c, c.V[vi], wo); if (!ew) continue;
        sol.routes[vi] = wo; sol.costs[vi] = ew.cost;
        const b = bestInsert(c, sol, k);
        if (b && oc - ew.cost - b.d > 1e-6) { applyIns(sol, b); any = true; }
        else { sol.routes[vi] = old; sol.costs[vi] = oc; }
      }
    }
    if (eliminate(c, sol)) any = true;
    if (!any || performance.now() > deadline) break;
  }
  return sol;
}

// Main entry: returns the best solution found within the time budget
function solve(reqs, vehicles, leg, budgetMs = 1500) {
  const c = buildCtx(reqs, vehicles, leg), n = reqs.length;
  const t0 = performance.now(), rnd = seeded(7);
  const hard = k => (reqs[k].onlyVehicle ? 0 : 4) + (reqs[k].wc ? 0 : 2) + (reqs[k].alone ? 0 : 1);
  let best = null, it = 0;
  if (!n) return { c, routes: c.V.map(() => []), costs: c.V.map(() => 0), un: [], iters: 0, ms: 0 };
  while (true) {
    let order = [...Array(n).keys()];
    if (it === 0) order.sort((a, b) => hard(a) - hard(b) || reqs[a].pe - reqs[b].pe);
    else if (it === 1) order.sort((a, b) => hard(a) - hard(b) || reqs[b].direct - reqs[a].direct);
    else { shuffle(order, rnd); if (it % 2) order.sort((a, b) => hard(a) - hard(b)); }
    const sol = improve(c, construct(c, order), t0 + budgetMs * 1.5);
    const score = sol.un.length * 1e7 + solCost(sol);
    if (!best || score < best.score) best = { ...sol, score };
    it++;
    if (performance.now() - t0 > budgetMs || it >= 80) break;
  }
  return { ...best, c, iters: it, ms: Math.round(performance.now() - t0) };
}

function solToPlan(c, sol) {
  return {
    createdAt: Date.now(),
    routes: c.V.map((v, i) => ({ vehicleId: v.id, nodes: sol.routes[i].map(code => ({ r: c.R[code >> 1].id, t: code & 1 ? 'D' : 'P' })) })),
  };
}

function planToSol(c, plan) {
  const routes = c.V.map(v => {
    const pr = plan.routes.find(r => r.vehicleId === v.id);
    if (!pr) return [];
    const codes = pr.nodes.filter(n => c.idx.has(n.r)).map(n => 2 * c.idx.get(n.r) + (n.t === 'D' ? 1 : 0));
    // keep only trips that have both pickup and drop-off
    const cnt = {}; codes.forEach(x => cnt[x >> 1] = (cnt[x >> 1] || 0) + 1);
    return codes.filter(x => cnt[x >> 1] === 2);
  });
  const costs = routes.map((r, i) => { const e = evalRoute(c, c.V[i], r); return e ? e.cost : scheduleDetail(c, c.V[i], r).cost; });
  return { routes, costs, un: [] };
}

// Full schedule for display. Never fails: rule breaks are listed as issues.
function scheduleDetail(c, v, route) {
  if (!route.length) return { nodes: [], km: 0, start: null, end: null, cost: 0, issues: [] };
  const run = t0 => {
    let t = t0, prev = v.b, km = 0, W = 0, F = Infinity, seats = 0, wc = 0, on = 0, al = 0;
    const nodes = [], issues = new Set(), pd = {};
    for (const code of route) {
      const k = code >> 1, d = code & 1, r = c.R[k], p = c.nB + code;
      t += c.T[prev][p]; km += c.K[prev][p]; prev = p;
      const arr = t, e = d ? r.de : r.pe, l = d ? r.dl : r.pl;
      if (t < e) { W += e - t; t = e; }
      const late = t > l + 0.5;
      if (late) issues.add(d && r.leg === 'ud' ? 'Ankommer efter mødetid' : 'Uden for tidsvindue');
      F = Math.min(F, W + Math.max(0, l - t));
      let rideMin = null;
      if (!d) {
        if (r.onlyVehicle && r.onlyVehicle !== v.id) issues.add('Fast chauffør ikke overholdt');
        seats += r.seats; wc += r.wc; on++; if (r.alone) al++;
        if (seats > v.seats || wc > v.wc) issues.add('Kapacitet overskredet');
        if (al && on > 1) issues.add('Enekørsel ikke overholdt');
        pd[k] = t + r.svc;
      } else {
        rideMin = t - pd[k];
        if (rideMin > r.ride + 0.5) issues.add('Maks. køretid overskredet');
        seats -= r.seats; wc -= r.wc; on--; if (r.alone) al--;
      }
      nodes.push({ code, k, d, arr, B: t, wait: t - arr, late, rideMin, load: seats + wc });
      t += r.svc;
    }
    t += c.T[prev][v.b]; km += c.K[prev][v.b];
    if (t > v.e + 0.5) issues.add('Over vagtens sluttid');
    return { nodes, km, start: t0, end: t, F, W, issues };
  };
  let a = run(v.s);
  const D = Math.max(0, Math.min(a.F, a.W));
  if (D > 0) a = run(v.s + D);
  a.issues = [...a.issues];
  a.cost = a.km * +S.settings.kmRate + (a.end - a.start) / 60 * +S.settings.hourRate + +S.settings.startFee;
  return a;
}

/* ---------- Helpers used by the planner ---------- */

// Optimise one leg of a day and store it as the plan
function optimiseLeg(date, leg, opts = {}) {
  const reqs = buildRequests(date, leg, opts);
  const vehicles = S.vehicles.filter(v => v.active && (!opts.types || opts.types.includes(v.type)));
  const sol = solve(reqs, vehicles, leg, opts.budget ?? +S.settings.effortMs);
  return { sol, plan: solToPlan(sol.c, sol), reqs };
}

// Insert one trip into the existing plan without moving anything else
function insertIntoPlan(date, leg, reqId, onlyVehicleId) {
  const m = dayModel(date, leg);
  const k = m.c.idx.get(reqId); if (k == null) return null;
  const sol = planToSol(m.c, m.plan || { routes: [] });
  let b;
  if (onlyVehicleId) {
    const vi = m.c.V.findIndex(v => v.id === onlyVehicleId);
    // search only the chosen vehicle
    const saveV = m.c.V.map(v => v.active);
    m.c.V.forEach((v, i) => v.active = i === vi);
    b = bestInsert(m.c, { routes: sol.routes, costs: sol.costs }, k);
    m.c.V.forEach((v, i) => v.active = saveV[i]);
    if (!b) { // force it in at the end so the dispatcher can sort it out
      sol.routes[vi] = sol.routes[vi].concat([2 * k, 2 * k + 1]);
      setPlan(date, leg, solToPlan(m.c, sol));
      return { forced: true, vehicleId: onlyVehicleId };
    }
  } else b = bestInsert(m.c, sol, k);
  if (!b) return null;
  applyIns(sol, b);
  setPlan(date, leg, solToPlan(m.c, sol));
  return { vehicleId: m.c.V[b.vi].id, extra: b.d };
}
