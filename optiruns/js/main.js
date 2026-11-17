/* Wiring: roles, views, clock, event delegation */

const VIEWS = { overview: renderOverview, plan: renderPlan, citizens: renderCitizens, institutions: renderInstitutions, operators: renderOperators, events: renderEvents, scenarios: renderScenarios, settings: renderSettings };
const ROLES = { inst: renderInstPortal, op: renderOpPortal, citizen: renderCitizenApp, driver: renderDriverApp };

function render() {
  $('#evBadge').textContent = openEvents().length || '';
  $('#clockTime').textContent = hm(S.clock);
  $('#clockSlider').value = S.clock;
  $('#dateInput').value = S.date;
  $('#playBtn').textContent = playing ? '⏸' : '▶';
  if (UI.role === 'office') VIEWS[UI.view]();
  else ROLES[UI.role]();
}

function showRole(role) {
  UI.role = role;
  document.querySelectorAll('#roles button').forEach(b => b.classList.toggle('active', b.dataset.role === role));
  document.querySelectorAll('.role').forEach(r => r.classList.toggle('active', r.id === 'role-' + role));
  render();
  if (role === 'office' && UI.view === 'plan' && map) setTimeout(() => map.invalidateSize(), 0);
}
function showView(view) {
  UI.view = view;
  document.querySelectorAll('#officeNav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.office-body > .view').forEach(v => v.classList.toggle('active', v.id === 'v-' + view));
  if (UI.role !== 'office') return showRole('office');
  render();
  if (view === 'plan' && map) setTimeout(() => { map.invalidateSize(); lastFit = ''; renderMap(dayModel(S.date, UI.leg)); }, 0);
}
ACT.role = d => showRole(d.role);
ACT.view = d => showView(d.view);

/* Simulated clock */
let playing = false, timer = null;
function tick() {
  S.clock = Math.min(S.clock + (+S.clockSpeed || 2), 18 * 60);
  if (S.clock >= 18 * 60) togglePlay(false);
  saveQuiet(); render();
}
function togglePlay(on = !playing) {
  playing = on; clearInterval(timer);
  if (playing) timer = setInterval(tick, 1000);
  render();
}
ACT.play = () => togglePlay();
CHG.clock = el => { S.clock = +el.value; saveQuiet(); render(); };
CHG.clockSpeed = el => { S.clockSpeed = +el.value; saveQuiet(); };
CHG.date = el => { if (!el.value) return; S.date = el.value; S.clock = toMin('06:00'); save(); lastFit = ''; render(); };

/* Event delegation */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (!a || a.disabled) return;
  const fn = ACT[a.dataset.act];
  if (fn) { e.preventDefault(); fn(a.dataset, a, e); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el, e);
});

/* Start */
loadState();
$('#clockSpeed').value = S.clockSpeed || 2;
initMap();
render();
