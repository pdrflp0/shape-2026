// Programa: carrega program.json e responde "em que semana/fase estou", "qual o próximo treino", etc.
import { db, kv } from './db.js';

export let P = null;

export async function loadProgram() {
  const r = await fetch('program.json', { cache: 'no-cache' }).catch(() => fetch('program.json'));
  P = await r.json();
  // índice de exercícios
  P.ex = {};
  for (const [wk, w] of Object.entries(P.workouts)) {
    w.key = wk;
    w.exercises.forEach((e, i) => { e.workout = wk; e.index = i; P.ex[e.id] = e; });
  }
  return P;
}

// ---------- Datas (sempre em horário local) ----------
export const pad = n => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((parseKey(dateKey(b)) - parseKey(dateKey(a))) / 86400000);
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const dowName = d => DOW[d.getDay()];
export const fmtDate = (d, withDow) => { d = typeof d === 'string' ? parseKey(d) : d; return `${withDow ? DOW[d.getDay()].slice(0, 3) + ', ' : ''}${d.getDate()} ${MON[d.getMonth()]}`; };
export const fmtShort = d => { d = typeof d === 'string' ? parseKey(d) : d; return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };

export const TOTAL_WEEKS = 11;

// Semana do programa (1..11). 0 = ainda não começou, 12 = terminou.
export function weekOf(d = new Date()) {
  const diff = daysBetween(parseKey(P.start), d);
  if (diff < 0) return 0;
  if (daysBetween(parseKey(P.end), d) > 0) return TOTAL_WEEKS + 1;
  return Math.min(TOTAL_WEEKS, Math.floor(diff / 7) + 1);
}
// Para regras de séries/RIR: antes do início usa a semana 1; depois do fim, a última.
export const effWeek = (d = new Date()) => Math.min(TOTAL_WEEKS, Math.max(1, weekOf(d)));
export const phaseOf = (d = new Date()) => phaseForWeek(effWeek(d));
export const phaseForWeek = w => P.phases.find(p => p.weeks.includes(w)) || P.phases[P.phases.length - 1];
export const cardioForWeek = w => P.cardio.find(c => c.weeks.includes(w)) || P.cardio[0];

export function weekLabel(d = new Date()) {
  const w = weekOf(d);
  if (w === 0) return { title: `Começa em ${daysBetween(d, parseKey(P.start))} dia(s)`, sub: `Seg ${fmtShort(P.start)}`, week: 0 };
  if (w > TOTAL_WEEKS) return { title: 'Programa concluído', sub: 'Mantendo a Reta final', week: w };
  return { title: `Semana ${w} de ${TOTAL_WEEKS}`, sub: phaseForWeek(w).name, week: w };
}

// Séries ajustadas pela fase
export function setsFor(ex, d = new Date()) {
  const ph = phaseOf(d);
  if (ph.sets === 'two') return Math.min(2, ex.sets);
  if (ph.sets === 'half') return Math.ceil(ex.sets / 2);
  return ex.sets;
}
export function rirFor(ex, d = new Date()) {
  const ph = phaseOf(d);
  return ex.type === 'compound' ? ph.rir.compound : ph.rir.isolation;
}
export function activeWarnings(ex, d = new Date()) {
  const w = effWeek(d);
  return (ex.warnings || []).filter(x => x.weeks.includes(w));
}

export async function getSettings() {
  return Object.assign({ restCompound: P.rest.compound, restIsolation: P.rest.isolation, sound: true, volume: 0.6, restOverrides: {} }, await kv.get('settings', {}));
}
export async function restFor(ex) {
  const s = await getSettings();
  if (s.restOverrides[ex.id]) return s.restOverrides[ex.id];
  return ex.type === 'compound' ? s.restCompound : s.restIsolation;
}

// ---------- Sequência A→B (não pula treino se faltar) ----------
export async function completedSessions() {
  const all = await db.all('sessions');
  return all.filter(s => s.endedAt).sort((a, b) => a.startedAt - b.startedAt);
}

export async function nextWorkoutKey() {
  const done = await completedSessions();
  if (!done.length) return P.sequence[0];
  const last = done[done.length - 1].workout;
  const i = P.sequence.indexOf(last);
  return P.sequence[(i + 1) % P.sequence.length];
}

export const plannedFor = d => P.schedule[String(d.getDay())];

// Grupos de exercício (bi-sets juntos) na ordem do treino
export function groupsOf(workoutKey) {
  const w = P.workouts[workoutKey];
  const groups = [];
  for (const e of w.exercises) {
    const g = e.superset && groups.find(x => x.id === e.superset);
    if (g) g.items.push(e);
    else groups.push({ id: e.superset || e.id, superset: !!e.superset, items: [e] });
  }
  return groups;
}
