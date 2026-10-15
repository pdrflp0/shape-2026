// Conquistas: calculadas a partir dos seus dados (nada a configurar). As novas aparecem no resumo do treino.
import { db, kv } from './db.js';
import { P, completedSessions, parseKey, daysBetween } from './program.js';
import { historyFor, sessionStats } from './progression.js';

const DEFS = [
  { id: 'first', icon: '🏁', title: 'Primeiro treino', desc: 'Concluiu o primeiro treino', goal: 1, val: c => c.n },
  { id: 'ten', icon: '🔟', title: '10 treinos', desc: '10 treinos concluídos', goal: 10, val: c => c.n },
  { id: 'quarter', icon: '💯', title: '25 treinos', desc: '25 treinos concluídos', goal: 25, val: c => c.n },
  { id: 'all', icon: '🏆', title: 'Programa completo', desc: 'Os 44 treinos do programa', goal: 44, val: c => c.n },
  { id: 'week', icon: '📅', title: 'Semana perfeita', desc: '4 treinos na mesma semana', goal: 1, val: c => c.perfectWeeks },
  { id: 'streak4', icon: '🔥', title: '4 semanas seguidas', desc: '4 semanas perfeitas em sequência', goal: 4, val: c => c.bestStreak },
  { id: 'pr1', icon: '🥇', title: 'Primeiro recorde', desc: 'Bateu um recorde pessoal', goal: 1, val: c => c.prs },
  { id: 'pr10', icon: '🎖️', title: '10 recordes', desc: '10 recordes pessoais', goal: 10, val: c => c.prs },
  { id: 'vol10', icon: '🏗️', title: '10 toneladas', desc: '10.000 kg de volume somado', goal: 10000, val: c => c.volume, fmt: v => Math.round(v / 1000) + 't' },
  { id: 'vol100', icon: '🚛', title: '100 toneladas', desc: '100.000 kg de volume somado', goal: 100000, val: c => c.volume, fmt: v => Math.round(v / 1000) + 't' },
  { id: 'kg2', icon: '⚖️', title: '−2 kg', desc: 'Média semanal 2 kg abaixo do início', goal: 2, val: c => c.lost, fmt: v => v.toFixed(1).replace('.', ',') },
  { id: 'kg5', icon: '📉', title: '−5 kg', desc: 'Média semanal 5 kg abaixo do início', goal: 5, val: c => c.lost, fmt: v => v.toFixed(1).replace('.', ',') },
  { id: 'goal', icon: '🎯', title: 'Meta atingida', desc: 'Média semanal dentro da meta de peso', goal: 1, val: c => c.inGoal ? 1 : 0 },
  { id: 'cardio10', icon: '🚶', title: '10 esteiras', desc: '10 sessões de cardio registradas', goal: 10, val: c => c.cardio },
  { id: 'protein7', icon: '🍗', title: '7 dias de proteína', desc: 'Bateu a proteína em 7 dias', goal: 7, val: c => c.proteinDays },
  { id: 'photos', icon: '📸', title: 'Primeiras fotos', desc: 'Primeira sessão de fotos de progresso', goal: 1, val: c => c.photoDays },
  { id: 'bench', icon: '💪', title: 'Supino = seu peso', desc: '1RM estimado do supino ≥ peso corporal', goal: 1, val: c => c.benchBw ? 1 : 0 },
  { id: 'squat', icon: '🦵', title: 'Agachamento 1,25×', desc: '1RM estimado do agachamento ≥ 1,25× o peso', goal: 1, val: c => c.squatBw ? 1 : 0 },
  { id: 'early', icon: '🌅', title: 'Madrugador', desc: 'Começou um treino antes das 7h', goal: 1, val: c => c.early },
  { id: 'backup', icon: '💾', title: 'Precavido', desc: 'Exportou um backup', goal: 1, val: c => c.backup },
];

async function context() {
  const ss = (await completedSessions()).filter(s => !s.test);
  const weights = (await db.all('weights')).sort((a, b) => a.id < b.id ? -1 : 1);
  const days = await db.all('days');
  const photos = await db.all('photos');
  const start = parseKey(P.start);
  const perWeek = new Map();
  for (const s of ss) { const w = Math.floor(daysBetween(start, parseKey(s.date)) / 7); if (w >= 0) perWeek.set(w, (perWeek.get(w) || 0) + 1); }
  const perfect = [...perWeek.entries()].filter(([, n]) => n >= 4).map(([w]) => w).sort((a, b) => a - b);
  let bestStreak = 0, run = 0, prev = null;
  for (const w of perfect) { run = prev != null && w === prev + 1 ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); prev = w; }
  // média dos últimos 7 dias de registros
  const last = weights[weights.length - 1];
  let avg = null;
  if (last) {
    const recent = weights.filter(w => daysBetween(parseKey(w.id), parseKey(last.id)) < 7);
    avg = recent.reduce((s, w) => s + w.kg, 0) / recent.length;
  }
  const bw = avg || P.goal.startWeight;
  const e1 = id => Math.max(0, ...historyFor(ss, id).map(h => sessionStats(h).e1));
  return {
    n: ss.length,
    perfectWeeks: perfect.length, bestStreak,
    prs: ss.reduce((s, x) => s + (x.prs ? x.prs.length : 0), 0),
    volume: ss.reduce((s, x) => s + (x.volume || 0), 0),
    lost: avg ? Math.max(0, P.goal.startWeight - avg) : 0,
    inGoal: avg != null && avg <= P.goal.targetMax,
    cardio: ss.filter(s => s.cardio && s.cardio.done).length + days.reduce((s, d) => s + (d.cardio ? d.cardio.length : 0), 0),
    proteinDays: days.filter(d => d.checks && d.checks.protein).length,
    photoDays: new Set(photos.map(p => p.date)).size,
    benchBw: e1('supino-reto') >= bw,
    squatBw: e1('agachamento-livre') >= bw * 1.25,
    early: ss.some(s => new Date(s.startedAt).getHours() < 7) ? 1 : 0,
    backup: (await kv.get('lastBackup', null)) ? 1 : 0,
  };
}

export async function achievements() {
  const c = await context();
  return DEFS.map(d => {
    const v = d.val(c);
    return { ...d, value: v, unlocked: v >= d.goal, pct: Math.min(1, v / d.goal), label: `${d.fmt ? d.fmt(Math.min(v, d.goal)) : Math.min(v, d.goal)}/${d.fmt ? d.fmt(d.goal) : d.goal}` };
  });
}

// Retorna as conquistas desbloqueadas desde a última checagem (e marca como vistas)
export async function newAchievements() {
  const list = await achievements();
  const seen = new Set(await kv.get('achSeen', []));
  const fresh = list.filter(a => a.unlocked && !seen.has(a.id));
  if (fresh.length) await kv.set('achSeen', [...seen, ...fresh.map(a => a.id)]);
  return fresh;
}
