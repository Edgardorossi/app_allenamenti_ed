/* Gym Log v2
   Flusso: apri l'app -> vedi la scheda di oggi -> Inizia -> corsa -> blocchi (2 esercizi + pausa, 3 giri) -> Termina.
   Tutto vive nel browser (localStorage): nessun server, nessun account. */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const KEY = 'gymlog.v2';
const DAYNAMES = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Formati data / ora ---------- */

function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function timeStr(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function clock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function humanDur(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`;
}
const longDate = (d) => cap(d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }));
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const fmt = (n) => String(+n.toFixed(2));

/* ---------- Dati ---------- */

// ----- La tua scheda: 5 giorni, blocchi (di solito 2 esercizi) -----
// Ogni esercizio è [nome, dettaglio]; il dettaglio è testo libero (es. "×12").
// run: 'before' = corsa prima dell'allenamento, 'after' = corsa dopo.
// weekday: 0 = domenica ... 6 = sabato. Tutto è modificabile dall'app (✎).
// Se cambi la scheda qui sotto, aumenta PLAN_VERSION: al prossimo avvio la scheda
// salvata nel telefono viene sostituita (lo storico resta).
const PLAN_VERSION = 2;
const ABS = [['Addominali', '×30'], ['Addominali laterali', '×30']];
const PLAN = [
  { name: 'Giorno 1: Petto + Tricipiti', weekday: 1, run: 'before', blocks: [
    [['Panca piana', '×12'], ['Pulley', '×12']],
    [['Panca inclinata con manubri', '×12'], ['Face pull', '×12']],
    [['Croci manubri', '×12'], ['French press manubri', '×12']],
    ABS
  ] },
  { name: 'Giorno 2: Schiena + Bicipiti', weekday: 2, run: 'before', blocks: [
    [['Lat machine presa larga', '×12'], ['Alzate laterali', '×12']],
    [['Curl con bilanciere', '×12'], ['Press manubri', '×12']],
    [['Rematore con manubrio a un braccio', '×12'], ['Piegamenti sulle braccia', '×12']],
    ABS
  ] },
  { name: 'Giorno 3: Gambe, quadricipiti e glutei', weekday: 3, run: 'after', blocks: [
    [['Squat corpo libero', '×12'], ['Leg press', '×12']],
    [['Affondi camminati', '×12'], ['Leg curl', '×12']],
    [['Leg extension', '×12'], ['Calf raise in piedi', '×12']],
    ABS
  ] },
  { name: 'Giorno 4: Spalle + Addome', weekday: 4, run: 'before', blocks: [
    [['Lento avanti con manubri', '×12'], ['Lat machine presa neutra', '×12']],
    [['Alzate laterali', '×12'], ['French press manubri', '×12']],
    [['Press manubri', '×12'], ['Curl manubri', '×12']],
    [['Scrollate con manubri', '×30'], ['Plank', '×30']]
  ] },
  { name: 'Giorno 5: Femorali + Glutei + finisher', weekday: 5, run: 'after', blocks: [
    [['Abductor', '×12'], ['Pulley', '×12']],
    [['Hip thrust', '×12'], ['Leg extension', '×12']],
    [['Goblet squat', '×12'], ['Affondi', '×12']],
    [['Corsa', '×30'], ['Stair master', '×30']]
  ] }
];

// Sostituisce i giorni con la scheda sopra. Mantiene gli id dei giorni (e il giorno
// della settimana che hai scelto) così lo storico e le impostazioni restano al loro posto.
function applyPlan(s) {
  const old = s.days || [];
  s.days = PLAN.map((p, i) => ({
    id: old[i] ? old[i].id : uid(),
    name: p.name,
    weekday: old[i] && old[i].weekday !== undefined ? old[i].weekday : p.weekday,
    run: p.run,
    blocks: p.blocks.map((b) => ({
      id: uid(),
      exercises: b.map(([name, detail]) => ({ id: uid(), name, detail }))
    }))
  }));
  s.planVersion = PLAN_VERSION;
  return s;
}

function defaultState() {
  return applyPlan({
    settings: { rounds: 3, pause: 50 }, // giri per blocco, secondi di pausa
    days: [],
    // chiave "YYYY-MM-DD|dayId" -> sessione di allenamento (vedi ensureSession)
    sessions: {}
  });
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.days) && s.sessions && typeof s.sessions === 'object') {
        s.settings = Object.assign({ rounds: 3, pause: 50 }, s.settings);
        if (s.planVersion !== PLAN_VERSION) {
          applyPlan(s);
          try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
        }
        return s;
      }
    }
  } catch (e) { /* dati corrotti o storage bloccato: riparto da zero */ }
  return defaultState();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Impossibile salvare i dati'); }
}

const getDay = (id) => state.days.find((d) => d.id === id);
const skey = (dayId, date = dateStr()) => `${date}|${dayId}`;

// Sessione di oggi per quel giorno. Se hai iniziato da poco (es. a cavallo
// della mezzanotte) ritrova anche una sessione ancora in corso.
function findSession(dayId) {
  const s = state.sessions[skey(dayId)];
  if (s) return s;
  const SIX_HOURS = 6 * 3600 * 1000;
  return Object.values(state.sessions).find(
    (x) => x.dayId === dayId && x.startedAt && !x.endedAt && !x.skipped && Date.now() - x.startedAt < SIX_HOURS
  ) || null;
}

function ensureSession(dayId) {
  let s = findSession(dayId);
  if (!s) {
    s = state.sessions[skey(dayId)] = {
      date: dateStr(),
      dayId,
      startedAt: null, // ms, quando premi "Inizia"
      endedAt: null,   // ms, quando premi "Termina"
      skipped: false,
      run: { min: '', incline: '', speed: '' },
      progress: {}     // per blocco: { round, done:{exId:true}, pauseEnd, complete }
    };
  }
  return s;
}

const status = (s) => (!s ? 'idle' : s.skipped ? 'skipped' : s.endedAt ? 'done' : s.startedAt ? 'running' : 'idle');

function prog(s, block) {
  if (!s.progress[block.id]) s.progress[block.id] = { round: 0, done: {}, pauseEnd: null, complete: false };
  return s.progress[block.id];
}

const isComplete = (s, block) => !!(s.progress[block.id] && s.progress[block.id].complete);

/* ---------- Corsa: confronto con l'ultima volta ---------- */

const dist = (r) => (num(r.min) !== null && num(r.speed) !== null ? (num(r.min) * num(r.speed)) / 60 : null);

function lastRun(excludeKey) {
  const keys = Object.keys(state.sessions).filter((k) => k !== excludeKey).sort().reverse();
  for (const k of keys) {
    const s = state.sessions[k];
    if (!s.skipped && s.run && num(s.run.min) !== null && num(s.run.speed) !== null) return s.run;
  }
  return null;
}

function runText(r) {
  const f = (v) => (num(v) === null ? '–' : fmt(num(v)));
  return `${f(r.min)} min · ${f(r.incline)}% · ${f(r.speed)} km/h`;
}

function updateRunInfo() {
  const el = $('#runinfo');
  const s = curSession();
  if (!el || !s) return;
  const cur = s.run;
  const last = lastRun(skey(view.id));
  const cm = num(cur.min), ci = num(cur.incline), cs = num(cur.speed);
  let html = '';
  if (dist(cur) !== null) html += `<div class="dist">≈ <b>${fmt(dist(cur))} km</b> percorsi</div>`;
  if (last) {
    const items = [];
    const d = (label, a, b, unit) => {
      if (a === null || b === null) return;
      const diff = a - b;
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
      items.push(`<span class="delta ${cls}">${label} ${diff > 0 ? '+' : ''}${fmt(diff)}${unit}</span>`);
    };
    d('Durata', cm, num(last.min), ' min');
    d('Inclinazione', ci, num(last.incline), '%');
    d('Velocità', cs, num(last.speed), ' km/h');
    d('Distanza', dist(cur), dist(last), ' km');
    if (items.length) html += `<div class="deltas">${items.join('')}</div>`;
    html += `<p class="sub" style="margin:8px 0 0">Ultima volta: ${runText(last)}</p>`;
  }
  el.innerHTML = html;
}

/* ---------- Utilità UI ---------- */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

const app = $('#app');
const go = (path) => { location.hash = '#/' + path; };

/* Tiene lo schermo acceso durante l'allenamento (se il browser lo supporta). */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on) {
      if (!wakeLock && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* non supportato: pazienza */ }
}

/* ---------- Router ---------- */

// view = cosa sto mostrando adesso
let view = { name: 'home', id: null };
const curSession = () => (view.name === 'workout' ? findSession(view.id) : null);
const todayDay = () => state.days.find((d) => d.weekday === new Date().getDay());

function render(keepScroll) {
  const [, name, id] = (location.hash || '#/').split('/');
  let rest = false;
  if (name === 'workout') view = { name: 'workout', id };
  else if (name === 'edit') view = { name: 'edit', id };
  else if (name === 'history') view = { name: 'history', id: null };
  else if (name === 'home') view = { name: 'home', id: null };
  else {
    // Pagina iniziale: apre direttamente la scheda del giorno di oggi.
    const t = todayDay();
    if (t) view = { name: 'workout', id: t.id };
    else { view = { name: 'home', id: null }; rest = true; }
  }

  if (view.name === 'workout') viewWorkout(view.id);
  else if (view.name === 'edit') viewEdit(view.id);
  else if (view.name === 'history') viewHistory();
  else viewHome(rest);

  keepAwake(view.name === 'workout' && status(curSession()) === 'running');
  if (!keepScroll) window.scrollTo(0, 0);
}

function refresh() {
  const y = window.scrollY;
  render(true);
  window.scrollTo(0, y);
}

window.addEventListener('hashchange', () => render());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && view.name === 'workout') refresh();
});

/* ---------- Schermata: tutti i giorni ---------- */

function viewHome(rest) {
  const wd = new Date().getDay();
  app.innerHTML = `
    <h1>Gym Log</h1>
    <p class="sub">${longDate(new Date())}</p>
    ${rest ? `<div class="card"><h2>Oggi è giorno di riposo 😴</h2>
      <p class="sub" style="margin:6px 0 0">Nessun allenamento in programma. Puoi comunque aprirne uno qui sotto.</p></div>` : ''}
    ${state.days.map((d) => {
      const st = status(findSession(d.id));
      const tag = st === 'done' ? '<span class="badge">fatto</span>'
        : st === 'skipped' ? '<span class="badge off">saltato</span>'
        : st === 'running' ? '<span class="badge">in corso</span>' : '';
      const isToday = d.weekday === wd;
      const when = d.weekday == null ? 'Nessun giorno assegnato' : DAYNAMES[d.weekday];
      return `
      <div class="card day ${isToday ? 'today' : ''}">
        <div class="info">
          <h2>${esc(d.name)}${tag}</h2>
          <p>${when}${isToday ? ' · oggi' : ''} · ${d.blocks.length} blocchi · corsa ${d.run === 'after' ? 'dopo' : 'prima'}</p>
        </div>
        <button class="icon" data-go="edit/${d.id}" aria-label="Modifica">✎</button>
        <button class="primary" data-go="workout/${d.id}">Apri</button>
      </div>`;
    }).join('')}

    <div class="card">
      <h2>Impostazioni blocchi</h2>
      <div class="settings">
        <label>Giri per blocco<input class="field" type="number" inputmode="numeric" min="1" max="10" data-set="rounds" value="${state.settings.rounds}"></label>
        <label>Pausa (secondi)<input class="field" type="number" inputmode="numeric" min="5" max="600" data-set="pause" value="${state.settings.pause}"></label>
      </div>
    </div>

    <div class="row">
      <button data-go="history">Storico</button>
      <button id="export">Esporta backup</button>
      <button id="import">Importa</button>
    </div>
    <input type="file" id="file" accept="application/json" hidden>`;

  $('#export').onclick = exportData;
  $('#import').onclick = () => $('#file').click();
  $('#file').onchange = importData;
}

/* ---------- Schermata: allenamento ---------- */

function runCardHtml(s) {
  const last = lastRun(skey(view.id));
  const ph = (k) => esc(last ? last[k] : '');
  return `
    <div class="card">
      <h2>🏃 Corsa</h2>
      <div class="runin">
        <label>Durata (min)<input type="number" inputmode="decimal" step="any" data-run="min" value="${esc(s.run.min)}" placeholder="${ph('min')}"></label>
        <label>Inclinaz. (%)<input type="number" inputmode="decimal" step="any" data-run="incline" value="${esc(s.run.incline)}" placeholder="${ph('incline')}"></label>
        <label>Velocità (km/h)<input type="number" inputmode="decimal" step="any" data-run="speed" value="${esc(s.run.speed)}" placeholder="${ph('speed')}"></label>
      </div>
      ${last ? '<div class="row"><button data-act="fill-last">Come l\'ultima volta</button></div>' : ''}
      <div id="runinfo"></div>
    </div>`;
}

function blockCardHtml(day, s, block) {
  const { rounds, pause } = state.settings;
  const p = prog(s, block);
  const idx = day.blocks.indexOf(block);
  const locked = !!p.pauseEnd;
  const allDone = block.exercises.every((e) => p.done[e.id]);
  const now = Date.now();

  const dots = Array.from({ length: rounds }, (_, i) =>
    `<i class="${i < p.round ? 'on' : i === p.round ? 'cur' : ''}"></i>`).join('');

  const exercises = block.exercises.map((e, i) => `
    <button class="exbtn ${p.done[e.id] ? 'done' : ''}" data-act="ex" data-ex="${e.id}" ${locked ? 'disabled' : ''}>
      <span class="mark">${p.done[e.id] ? '✓' : i + 1}</span>
      <span class="exname">${esc(e.name || 'Esercizio')}</span>
      <span class="exdet">${esc(e.detail || '')}</span>
    </button>`).join('');

  let pauseBtn;
  if (!allDone) {
    pauseBtn = `<button class="pause locked" disabled>Pausa · ${pause}s</button>`;
  } else if (!p.pauseEnd) {
    pauseBtn = `<button class="pause ready" data-act="pause-start">Avvia pausa · ${pause}s</button>`;
  } else if (p.pauseEnd > now) {
    const left = Math.ceil((p.pauseEnd - now) / 1000);
    pauseBtn = `<button class="pause running" disabled>Pausa <span id="pausetime" data-end="${p.pauseEnd}">${Math.floor(left / 60)}:${pad(left % 60)}</span></button>`;
  } else {
    const lastRound = p.round + 1 >= rounds;
    const hasNext = idx + 1 < day.blocks.length;
    const next = !lastRound ? 'prossimo giro' : hasNext ? 'blocco successivo' : 'fine blocchi';
    pauseBtn = `<button class="pause finished" data-act="pause-next">Pausa finita · ${next}</button>`;
  }

  return `
    <div class="card">
      <div class="blockhead">
        <span class="group-tag">BLOCCO ${idx + 1} DI ${day.blocks.length}</span>
        <span class="dots">${dots}</span>
      </div>
      <p class="sub" style="margin:0 0 12px">Giro ${Math.min(p.round + 1, rounds)} di ${rounds}</p>
      ${exercises}
      ${pauseBtn}
    </div>`;
}

function viewWorkout(dayId) {
  const day = getDay(dayId);
  if (!day) return go('home');
  const s = findSession(dayId);
  const st = status(s);
  const { rounds, pause } = state.settings;
  const isToday = day.weekday === new Date().getDay();
  const planned = day.weekday != null && !isToday ? ` · previsto: ${DAYNAMES[day.weekday]}` : '';
  const after = day.run === 'after'; // corsa dopo l'allenamento

  let body = '';

  if (st === 'idle') {
    const runNote = `
      <div class="card"><h2>🏃 Corsa ${after ? 'dopo' : 'prima'}</h2>
        <p class="sub" style="margin:6px 0 0">Durata, inclinazione e velocità si inseriscono dopo aver premuto Inizia.</p></div>`;
    const list = day.blocks.map((b, i) => `
        <div class="card">
          <span class="group-tag">BLOCCO ${i + 1}</span>
          <ul class="exlist">${b.exercises.map((e) => `<li>${esc(e.name || 'Esercizio')} <span class="muted">${esc(e.detail || '')}</span></li>`).join('')}</ul>
          <p class="sub" style="margin:8px 0 0">${rounds} giri · pausa ${pause}s</p>
        </div>`).join('');
    body = `
      <div class="row" style="margin:0 0 14px">
        <button class="primary big" data-act="start" style="flex:2">▶ Inizia allenamento</button>
        <button class="big" data-act="skip" style="flex:1">Salta</button>
      </div>
      ${after ? list + runNote : runNote + list}`;
  } else if (st === 'skipped') {
    body = `
      <div class="card center">
        <h2>Allenamento saltato</h2>
        <p class="sub" style="margin:6px 0 12px">Segnato come saltato per oggi.</p>
        <button data-act="unskip" style="width:100%">Annulla</button>
      </div>`;
  } else if (st === 'running') {
    const cur = day.blocks.find((b) => !isComplete(s, b));
    const done = day.blocks.filter((b) => isComplete(s, b)).length;
    body = `
      <div class="card">
        <p class="sub" style="margin:0">In corso · iniziato alle ${timeStr(s.startedAt)}</p>
        <div class="clock" id="elapsed">${clock(Date.now() - s.startedAt)}</div>
        <button class="danger" style="width:100%" data-act="finish">Termina allenamento</button>
      </div>
      ${after ? '' : runCardHtml(s)}
      ${cur ? blockCardHtml(day, s, cur)
            : `<div class="card center"><h2>Blocchi completati ✓</h2>
               <p class="sub" style="margin:6px 0 0">${after ? 'Ora fai la corsa e inseriscila qui sotto, poi premi' : 'Ottimo lavoro! Premi'} "Termina allenamento" per salvare la durata.</p></div>`}
      ${done ? `<p class="sub" style="text-align:center">Blocchi completati: ${done}/${day.blocks.length}</p>` : ''}
      ${after ? runCardHtml(s) : ''}`;
  } else {
    const done = day.blocks.filter((b) => isComplete(s, b)).length;
    body = `
      <div class="card center">
        <h2>Allenamento completato ✓</h2>
        <div class="clock" style="font-size:38px;margin:10px 0">${humanDur(s.endedAt - s.startedAt)}</div>
        <p class="sub" style="margin:0">Inizio ${timeStr(s.startedAt)} · fine ${timeStr(s.endedAt)}</p>
        <p class="sub" style="margin:4px 0 0">Blocchi completati: ${done}/${day.blocks.length}</p>
      </div>
      ${dist(s.run) !== null || num(s.run.min) !== null ? `
        <div class="card"><h2>🏃 Corsa</h2>
          <p style="margin:8px 0 0">${runText(s.run)}${dist(s.run) !== null ? ` · ≈ ${fmt(dist(s.run))} km` : ''}</p></div>` : ''}
      <button class="ghost" style="width:100%" data-act="reopen">Riprendi allenamento</button>`;
  }

  app.innerHTML = `
    <div class="topbar">
      <button class="icon" data-go="home" aria-label="Tutti i giorni">☰</button>
      <h1>${esc(day.name)}</h1>
    </div>
    <p class="sub">${longDate(new Date())}${planned}</p>
    ${body}`;

  if (st === 'running') updateRunInfo();
}

/* ---------- Azioni (pulsanti con data-act) ---------- */

const actions = {
  start() {
    const s = ensureSession(view.id);
    s.startedAt = Date.now();
    s.endedAt = null;
    s.skipped = false;
    save(); refresh();
  },
  skip() {
    if (!confirm('Segnare questo allenamento come saltato?')) return;
    ensureSession(view.id).skipped = true;
    save(); refresh();
  },
  unskip() {
    const s = curSession();
    if (s) { s.skipped = false; save(); refresh(); }
  },
  finish() {
    const day = getDay(view.id), s = curSession();
    if (!day || !s) return;
    const open = day.blocks.some((b) => !isComplete(s, b));
    if (open && !confirm('Non hai completato tutti i blocchi. Terminare comunque?')) return;
    s.endedAt = Date.now();
    save(); refresh();
  },
  reopen() {
    const s = curSession();
    if (s) { s.endedAt = null; save(); refresh(); }
  },
  ex(el) {
    const day = getDay(view.id), s = curSession();
    const block = day.blocks.find((b) => b.exercises.some((x) => x.id === el.dataset.ex));
    const p = prog(s, block);
    if (p.pauseEnd) return;
    p.done[el.dataset.ex] = !p.done[el.dataset.ex];
    save(); refresh();
  },
  'pause-start'() {
    const day = getDay(view.id), s = curSession();
    const block = day.blocks.find((b) => !isComplete(s, b));
    prog(s, block).pauseEnd = Date.now() + state.settings.pause * 1000;
    save(); refresh();
  },
  'pause-next'() {
    const day = getDay(view.id), s = curSession();
    const block = day.blocks.find((b) => !isComplete(s, b));
    const p = prog(s, block);
    p.round += 1;
    p.done = {};
    p.pauseEnd = null;
    if (p.round >= state.settings.rounds) p.complete = true; // il blocco "scompare"
    save(); refresh();
  },
  'fill-last'() {
    const s = curSession();
    const last = lastRun(skey(view.id));
    if (!s || !last) return;
    s.run = { min: last.min, incline: last.incline, speed: last.speed };
    save(); refresh();
  }
};

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-go]');
  if (nav) return go(nav.dataset.go);
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el);
});

// Campi corsa e impostazioni
app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.run) {
    const s = curSession();
    if (!s) return;
    s.run[t.dataset.run] = t.value;
    save();
    updateRunInfo();
  } else if (t.dataset.set) {
    const v = parseInt(t.value, 10);
    if (isNaN(v)) return;
    const [lo, hi] = t.dataset.set === 'rounds' ? [1, 10] : [5, 600];
    state.settings[t.dataset.set] = Math.min(hi, Math.max(lo, v));
    save();
  }
});

/* ---------- Ticker: cronometro e pausa (silenzioso) ---------- */

setInterval(() => {
  const el = $('#elapsed');
  const s = curSession();
  if (el && s && s.startedAt && !s.endedAt) el.textContent = clock(Date.now() - s.startedAt);

  const pt = $('#pausetime');
  if (pt) {
    const left = Math.ceil((+pt.dataset.end - Date.now()) / 1000);
    if (left <= 0) refresh(); // la pausa è finita: il pulsante diventa verde (nessun suono)
    else pt.textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
  }
}, 500);

/* ---------- Schermata: modifica giorno ---------- */

function viewEdit(dayId) {
  const day = getDay(dayId);
  if (!day) return go('home');

  const draw = () => {
    app.innerHTML = `
      <div class="topbar">
        <button class="icon" data-go="home" aria-label="Indietro">←</button>
        <h1>Modifica</h1>
      </div>
      <div class="card">
        <label class="sub" for="dn">Nome / gruppo muscolare</label>
        <input id="dn" class="field" value="${esc(day.name)}">
        <label class="sub" for="wd" style="margin-top:12px">Giorno della settimana</label>
        <select id="wd" class="field">
          <option value="">Nessuno</option>
          ${[1, 2, 3, 4, 5, 6, 0].map((n) => `<option value="${n}" ${day.weekday === n ? 'selected' : ''}>${DAYNAMES[n]}</option>`).join('')}
        </select>
        <label class="sub" for="rn" style="margin-top:12px">Corsa</label>
        <select id="rn" class="field">
          <option value="before" ${day.run !== 'after' ? 'selected' : ''}>Prima dell'allenamento</option>
          <option value="after" ${day.run === 'after' ? 'selected' : ''}>Dopo l'allenamento</option>
        </select>
      </div>

      ${day.blocks.map((b, bi) => `
        <div class="card" data-block="${b.id}">
          <div class="blockhead">
            <span class="group-tag">BLOCCO ${bi + 1}</span>
            <button class="icon danger" data-delblock="${b.id}" aria-label="Elimina blocco">🗑</button>
          </div>
          ${b.exercises.map((e) => `
            <div class="editrow" data-ex="${e.id}">
              <input class="field" type="text" data-f="name" value="${esc(e.name)}" placeholder="Nome esercizio">
              <input class="field det" type="text" data-f="detail" value="${esc(e.detail || '')}" placeholder="×12">
              <button class="icon danger" data-delex="${e.id}" aria-label="Elimina esercizio">✕</button>
            </div>`).join('')}
          <div class="row"><button data-addex="${b.id}">+ Esercizio</button></div>
        </div>`).join('')}

      <button id="addblock" style="width:100%">+ Aggiungi blocco</button>`;

    $('#dn').oninput = (e) => { day.name = e.target.value; save(); };
    $('#wd').onchange = (e) => { day.weekday = e.target.value === '' ? null : +e.target.value; save(); };
    $('#rn').onchange = (e) => { day.run = e.target.value; save(); };

    $$('.editrow input').forEach((inp) => {
      inp.oninput = () => {
        const id = inp.closest('.editrow').dataset.ex;
        for (const b of day.blocks) {
          const ex = b.exercises.find((x) => x.id === id);
          if (ex) ex[inp.dataset.f] = inp.value;
        }
        save();
      };
    });

    $$('[data-delex]').forEach((btn) => {
      btn.onclick = () => {
        day.blocks.forEach((b) => { b.exercises = b.exercises.filter((x) => x.id !== btn.dataset.delex); });
        day.blocks = day.blocks.filter((b) => b.exercises.length); // un blocco vuoto sparisce
        save(); draw();
      };
    });

    $$('[data-delblock]').forEach((btn) => {
      btn.onclick = () => {
        if (!confirm('Eliminare questo blocco?')) return;
        day.blocks = day.blocks.filter((b) => b.id !== btn.dataset.delblock);
        save(); draw();
      };
    });

    $$('[data-addex]').forEach((btn) => {
      btn.onclick = () => {
        const b = day.blocks.find((x) => x.id === btn.dataset.addex);
        b.exercises.push({ id: uid(), name: '' });
        save(); draw();
        const inputs = $$(`[data-block="${b.id}"] .editrow input[data-f=name]`);
        inputs[inputs.length - 1].focus();
      };
    });

    $('#addblock').onclick = () => {
      day.blocks.push({ id: uid(), exercises: [{ id: uid(), name: '' }, { id: uid(), name: '' }] });
      save(); draw();
      window.scrollTo(0, document.body.scrollHeight);
    };
  };
  draw();
}

/* ---------- Schermata: storico ---------- */

function viewHistory() {
  const sessions = Object.values(state.sessions)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || 0) - (a.startedAt || 0));

  // Tabella corse, dalla più vecchia alla più recente per calcolare le frecce.
  const runs = sessions
    .filter((s) => !s.skipped && s.run && num(s.run.min) !== null && num(s.run.speed) !== null)
    .slice().reverse();
  const arrow = (cur, prev) => (prev == null || cur == null || cur === prev ? ''
    : cur > prev ? '<i class="up">▲</i>' : '<i class="down">▼</i>');

  const rows = runs.map((s, i) => {
    const prev = i > 0 ? runs[i - 1].run : null;
    const g = (k) => num(s.run[k]);
    const pg = (k) => (prev ? num(prev[k]) : null);
    const date = new Date(s.date + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    return `<tr>
      <td>${date}</td>
      <td>${fmt(g('min'))}${arrow(g('min'), pg('min'))}</td>
      <td>${g('incline') === null ? '–' : fmt(g('incline')) + arrow(g('incline'), pg('incline'))}</td>
      <td>${fmt(g('speed'))}${arrow(g('speed'), pg('speed'))}</td>
      <td>${fmt(dist(s.run))}${arrow(dist(s.run), prev ? dist(prev) : null)}</td>
    </tr>`;
  }).reverse().slice(0, 15).join('');

  const list = sessions.map((s) => {
    const day = getDay(s.dayId);
    const name = day ? esc(day.name) : 'Giorno eliminato';
    const date = longDate(new Date(s.date + 'T12:00:00'));
    let info;
    if (s.skipped) info = '<p class="muted">Saltato</p>';
    else if (!s.startedAt) return '';
    else {
      const done = day ? day.blocks.filter((b) => isComplete(s, b)).length : 0;
      info = `<p>Inizio <b>${timeStr(s.startedAt)}</b> · ${s.endedAt ? 'durata <b>' + humanDur(s.endedAt - s.startedAt) + '</b>' : '<span class="muted">non terminato</span>'}</p>
        ${num(s.run.min) !== null ? `<p class="muted">Corsa: ${runText(s.run)}${dist(s.run) !== null ? ' (≈ ' + fmt(dist(s.run)) + ' km)' : ''}</p>` : ''}
        ${day ? `<p class="muted">Blocchi completati: ${done}/${day.blocks.length}</p>` : ''}`;
    }
    return `<div class="card hist"><h2>${name}</h2><div class="d">${date}</div>${info}</div>`;
  }).join('');

  app.innerHTML = `
    <div class="topbar">
      <button class="icon" data-go="home" aria-label="Indietro">←</button>
      <h1>Storico</h1>
    </div>
    ${rows ? `<div class="card"><h2>Progressi corsa</h2>
      <table class="runs"><thead><tr><th>Data</th><th>Min</th><th>Incl. %</th><th>km/h</th><th>km</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : ''}
    ${list || '<p class="empty">Ancora nessun allenamento registrato.</p>'}`;
}

/* ---------- Backup ---------- */

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gymlog-backup-${dateStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!Array.isArray(data.days) || !data.sessions || typeof data.sessions !== 'object') throw new Error('formato');
      data.settings = Object.assign({ rounds: 3, pause: 50 }, data.settings);
      if (data.planVersion !== PLAN_VERSION) applyPlan(data);
      state = data;
      save(); render(); toast('Backup importato');
    } catch (err) { toast('File non valido'); }
  };
  r.readAsText(f);
}

/* ---------- Avvio ---------- */

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
