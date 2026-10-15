// Progressão dupla, 1RM estimado (Epley) e recordes.
import { kv } from './db.js';
import { P, phaseOf, setsFor, activeWarnings } from './program.js';

export const histKey = (exId, variant) => variant === 'alt' ? `${exId}:alt` : exId;
export const epley = (kg, reps) => (!kg || !reps) ? 0 : reps === 1 ? kg : kg * (1 + reps / 30);

const STEP = { barbell: 2.5, machine: 5, dumbbell: 1, cable: 1, bodyweight: 0 };
export function roundLoad(x, load) {
  const s = STEP[load] || 0.5;
  if (!s) return 0;
  return Math.max(0, Math.round(x / s) * s);
}
export const fmtKg = n => (n == null || n === '' || isNaN(n)) ? '–' : (Math.round(n * 10) / 10).toString().replace('.', ',');

// Definição efetiva (principal ou alternativa)
export function variantDef(ex, variant) {
  if (variant !== 'alt') return { name: ex.name, equip: ex.equip, load: ex.load, inc: ex.inc, anim: ex.anim };
  return { name: ex.alt.name, equip: ex.alt.equip, load: ex.alt.load || ex.load, inc: ex.alt.inc ?? ex.inc, anim: ex.alt.anim || ex.anim };
}

export function incText(def) {
  switch (def.load) {
    case 'barbell': return `+${fmtKg(def.inc)} kg na barra`;
    case 'machine': return `+1 placa/pino (~${fmtKg(def.inc)} kg)`;
    case 'dumbbell': return `+${fmtKg(def.inc)} kg por halter`;
    case 'cable': return `+${fmtKg(def.inc)} kg (1 pino)`;
    default: return '';
  }
}

// Histórico de um exercício (só sessões concluídas, só séries feitas)
export function historyFor(sessions, key) {
  const out = [];
  for (const s of sessions) {
    if (!s.endedAt) continue;
    for (const [exId, en] of Object.entries(s.entries || {})) {
      if (histKey(exId, en.variant) !== key) continue;
      const sets = (en.sets || []).filter(x => x.done && x.reps > 0);
      if (sets.length) out.push({ date: s.date, sessionId: s.id, phase: s.phase, sets, note: en.note });
    }
  }
  return out.sort((a, b) => a.date < b.date ? -1 : 1);
}

export async function getPrimeLoads() { return kv.get('primeLoads', {}); }

// Sugestão do dia
export function suggest(ex, variant, sessions, primeLoads, date = new Date(), excludeSessionId) {
  const def = variantDef(ex, variant);
  const key = histKey(ex.id, variant);
  const n = setsFor(ex, date);
  const [lo, hi] = ex.reps;
  const ph = phaseOf(date);
  const timed = ex.unit === 's';
  const warn = activeWarnings(ex, date);
  const bodyweightOnly = warn.some(w => w.bodyweight) || def.load === 'bodyweight';
  const fill = v => Array.from({ length: n }, (_, i) => typeof v === 'function' ? v(i) : v);

  let hist = historyFor(sessions.filter(s => s.id !== excludeSessionId), key);
  // fora do deload, a progressão ignora as sessões de deload (cargas reduzidas)
  if (ph.id !== 'deload') {
    const nd = hist.filter(h => h.phase !== 'deload');
    if (nd.length) hist = nd;
  }
  const last = hist[hist.length - 1];
  const prev = hist[hist.length - 2];
  const res = { n, lo, hi, timed, last, kg: null, reps: fill(lo), action: 'first', msg: '', bodyweightOnly, def };

  if (timed) {
    res.kg = 0; res.reps = fill(hi); res.action = last ? 'keep' : 'first';
    res.msg = `Segure ${hi} s em cada série`;
    return res;
  }

  if (!last) {
    const prime = primeLoads[key] ?? (variant !== 'alt' ? primeLoads[ex.id] : null);
    if (bodyweightOnly) { res.kg = 0; res.msg = 'Só peso corporal nesta fase'; }
    else if (prime) {
      const f = (P.phases.find(p => p.primeFactor) || {}).primeFactor || 0.55;
      let kg = roundLoad(prime * f, def.load);
      if (ph.id === 'deload') kg = roundLoad(kg * (ph.deloadFactor || 0.85), def.load);
      res.kg = kg;
      res.msg = `Primeira vez: ~${Math.round(f * 100)}% do prime (${fmtKg(prime)} kg)`;
    } else res.msg = 'Primeira vez: escolha uma carga confortável';
    res.reps = fill(lo);
    return res;
  }

  const lastKg = Math.max(...last.sets.map(s => +s.kg || 0));
  const allTop = last.sets.every(s => s.reps >= hi);
  const below = h => h && h.sets.filter(s => s.reps < lo).length > h.sets.length / 2;

  if (bodyweightOnly) {
    res.kg = 0; res.action = 'keep';
    res.reps = fill(i => Math.min(hi, Math.max(lo, (last.sets[i] || last.sets[last.sets.length - 1]).reps + 1)));
    res.msg = 'Só peso corporal nesta fase';
  } else if (allTop) {
    // RIR registrado: se sobrou muita reserva (≥3 em todas, fora da readaptação/deload), sobe 2 degraus
    const rirs = last.sets.map(x => x.rir).filter(x => x != null);
    const easy = ph.sets === 'full' && rirs.length === last.sets.length && rirs.every(x => x >= 3);
    res.kg = lastKg + def.inc * (easy ? 2 : 1); res.action = 'up'; res.reps = fill(lo);
    res.msg = easy
      ? `Topo (${hi}) em todas e sobrou RIR 3+ → suba 2 degraus (+${fmtKg(def.inc * 2)} kg)`
      : `Bateu o topo (${hi}) em todas → suba a carga (${incText(def)})`;
  } else if (below(last) && below(prev)) {
    res.kg = roundLoad(lastKg * 0.9, def.load); res.action = 'down'; res.reps = fill(lo);
    res.msg = `Abaixo de ${lo} reps 2 sessões seguidas → reduza ~10%`;
  } else {
    res.kg = lastKg; res.action = 'keep';
    res.reps = fill(i => Math.min(hi, Math.max(lo, (last.sets[i] || last.sets[last.sets.length - 1]).reps + 1)));
    res.msg = 'Mantenha a carga e tente mais reps';
  }

  if (ph.id === 'deload' && !bodyweightOnly) {
    const base = res.action === 'up' ? lastKg : res.kg;
    res.kg = roundLoad(base * (ph.deloadFactor || 0.85), def.load);
    res.reps = fill(lo); res.action = 'deload';
    res.msg = `Deload: ~${Math.round((1 - (ph.deloadFactor || 0.85)) * 100)}% mais leve, longe da falha`;
  }
  return res;
}

export function lastLine(s) {
  if (!s.last) return null;
  const kgs = [...new Set(s.last.sets.map(x => fmtKg(x.kg)))];
  return `${kgs.join('/')} kg × ${s.last.sets.map(x => x.reps).join(', ')}`;
}
export function todayLine(s) {
  if (s.timed) return `${s.reps.join(', ')} s`;
  const kg = s.kg == null ? '? kg' : s.kg === 0 ? 'peso corporal' : `${fmtKg(s.kg)} kg`;
  return `${kg}, tente ${s.reps.join(', ')}`;
}

// Recordes (por chave de histórico)
export function recordsFor(hist) {
  let bestKg = null, bestE = null, bestVol = null;
  for (const h of hist) {
    let vol = 0;
    for (const s of h.sets) {
      vol += (s.kg || 0) * s.reps;
      if (!bestKg || s.kg > bestKg.kg || (s.kg === bestKg.kg && s.reps > bestKg.reps)) bestKg = { kg: s.kg, reps: s.reps, date: h.date };
      const e = epley(s.kg, s.reps);
      if (!bestE || e > bestE.e) bestE = { e, kg: s.kg, reps: s.reps, date: h.date };
    }
    if (!bestVol || vol > bestVol.vol) bestVol = { vol, date: h.date };
  }
  return { bestKg, bestE, bestVol };
}

export function sessionStats(h) {
  let maxKg = 0, e1 = 0, vol = 0;
  for (const s of h.sets) { maxKg = Math.max(maxKg, s.kg || 0); e1 = Math.max(e1, epley(s.kg, s.reps)); vol += (s.kg || 0) * s.reps; }
  return { maxKg, e1, vol };
}

// ---------- Anilhas por lado ----------
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export function platesPerSide(total, bar = 20, plates = DEFAULT_PLATES) {
  let side = (total - bar) / 2;
  if (!(side > 0)) return null;
  const out = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (side >= p - 1e-6) { out.push(p); side -= p; }
  }
  return { plates: out, rest: Math.round(side * 100) / 100 };
}
export function platesText(total, bar, plates) {
  const r = platesPerSide(total, bar, plates);
  if (!r) return total > 0 && total <= bar ? `só a barra (${fmtKg(bar)})` : '';
  const f = n => String(n).replace('.', ','); // anilhas precisam de 2 casas (1,25)
  return `por lado: ${r.plates.length ? r.plates.map(f).join(' + ') : '—'}${r.rest > 0 ? ` · não fecha (faltam ${f(r.rest)})` : ''}`;
}

// ---------- Aquecimento sugerido (compostos) ----------
export function warmupSets(work, def, bar = 20) {
  if (!(work > 0)) return [];
  const steps = def.load === 'barbell'
    ? [[0, 10], [0.5, 6], [0.7, 4], [0.85, 2]]
    : [[0.5, 10], [0.75, 5]];
  const out = [];
  for (const [f, reps] of steps) {
    const kg = f === 0 ? bar : roundLoad(work * f, def.load);
    if (def.load === 'barbell' && f > 0 && kg <= bar) continue;
    if (kg >= work || (out.length && kg <= out[out.length - 1].kg)) continue;
    out.push({ kg, reps });
  }
  return out;
}

// Recordes de uma sessão em relação às sessões anteriores (usado ao finalizar e ao corrigir um treino)
export function computePRs(session, priorSessions) {
  const out = [];
  for (const [exId, en] of Object.entries(session.entries || {})) {
    const ex = P.ex[exId]; if (!ex || ex.unit === 's') continue;
    const prior = historyFor(priorSessions, histKey(exId, en.variant));
    const doneSets = en.sets.filter(x => x.done && x.reps > 0);
    if (!prior.length || !doneSets.length) continue;
    const rec = recordsFor(prior);
    const st = sessionStats({ sets: doneSets });
    const def = variantDef(ex, en.variant);
    if (st.maxKg > (rec.bestKg?.kg || 0)) out.push({ exId, name: def.name, kind: 'Carga', value: `${fmtKg(st.maxKg)} kg` });
    else if (st.e1 > (rec.bestE?.e || 0) + 0.01) out.push({ exId, name: def.name, kind: '1RM est.', value: `${fmtKg(Math.round(st.e1 * 10) / 10)} kg` });
  }
  return out;
}
