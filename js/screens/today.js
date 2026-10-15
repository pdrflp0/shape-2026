// Tela "Hoje": fase atual, próximo treino pendente, semana, lembretes, resumo do dia, peso e contagem regressiva.
import { kv } from '../db.js';
import { P, weekLabel, nextWorkoutKey, plannedFor, completedSessions, programSessions, countsForProgram, dateKey, parseKey, daysBetween, addDays, effWeek, weekOf, phaseOf, cardioForWeek, groupsOf, setsFor, fmtDate, PLANNED_SESSIONS, TOTAL_WEEKS } from '../program.js';
import { nav, esc, ICON, fmtNum, sheet, toast, haptic } from '../ui.js';
import { ring } from '../charts.js';
import { getActive, startSession, openSession, isStale, finishFlow } from './session.js';
import { openCardio } from './cardio.js';
import { nutritionTargets, getProfile, currentWeight } from './diet.js';
import { addWeightSheet, photoDue, weekStreak, setProgressTab } from './progress.js';
import { getDay, saveDay } from '../day.js';
import { hhmmss } from '../timer.js';
import { newAchievements } from '../achievements.js';

const LINES = {
  pre: 'Faltam poucos dias. Separe a mochila, defina o horário e cadastre as cargas do prime no Perfil.',
  readapt: 'Começo é com calma: as primeiras semanas são para o corpo lembrar. Técnica antes de carga.',
  build: 'Cada rep a mais conta. Bateu o topo da faixa em todas as séries? Sobe a carga.',
  deload: 'Semana leve não é semana perdida: é aqui que o corpo se reconstrói para a reta final.',
  final: 'Reta final! Constância, proteína alta e passos em dia até 31/12.',
  done: 'Programa concluído. Que orgulho! Hora de planejar o próximo ciclo.',
  rest: 'Dia de descanso: sono, proteína e passos também são treino hoje.',
};

// Treinos desta semana do programa + os próximos da sequência para completar 4
async function weekStrip(now, nextKey) {
  const start = parseKey(P.start);
  const wk = Math.max(0, Math.floor(daysBetween(start, now) / 7));
  const w0 = dateKey(addDays(start, wk * 7)), w1 = dateKey(addDays(start, wk * 7 + 6));
  const done = (await programSessions()).filter(s => s.date >= w0 && s.date <= w1);
  const slots = done.map(s => ({ key: s.workout, done: true, date: s.date }));
  let i = P.sequence.indexOf(nextKey);
  while (slots.length < P.sequence.length) { slots.push({ key: P.sequence[i % P.sequence.length], done: false }); i++; }
  return { slots, count: done.length };
}

export async function renderToday(el) {
  const now = new Date();
  const prof = await getProfile();
  const first = (prof.name || 'Pedro').split(' ')[0];
  const wl = weekLabel(now);
  const wNum = weekOf(now);
  const ph = phaseOf(now);
  const active = await getActive();
  const done = await completedSessions();
  const todayDone = done.filter(s => s.date === dateKey());
  const nextKey = await nextWorkoutKey();
  const next = P.workouts[nextKey];
  const planned = plannedFor(now);
  const day = await getDay();
  const t = await nutritionTargets();
  const w = await currentWeight();
  const plan = cardioForWeek(effWeek(now));
  const daysLeft = Math.max(0, daysBetween(now, parseKey(P.end)));
  const { streak } = await weekStreak();
  const photos = await photoDue();
  const settings = await kv.get('settings', {});
  const lastBackup = await kv.get('lastBackup', null);
  const h = now.getHours();
  const hello = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const cardioMin = todayDone.reduce((s, x) => s + (x.cardio?.minutes || 0), 0) + day.cardio.reduce((s, c) => s + c.minutes, 0);
  const nGroups = groupsOf(nextKey).length;
  const nSets = next.exercises.reduce((s, e) => s + setsFor(e, now), 0);
  const estMin = Math.round(nSets * 2.6 + 5);
  const nProgram = (await programSessions()).length;
  const strip = await weekStrip(now, nextKey);
  const weighDays = settings.weighDays || [1, 3, 5];
  const weighToday = weighDays.includes(now.getDay()) && !(w.last && w.last.id === dateKey()) && wNum <= TOTAL_WEEKS;
  const backupDue = done.length > 0 && (!lastBackup || Date.now() - lastBackup > 7 * 86400000);
  const line = wNum === 0 ? LINES.pre : wNum > TOTAL_WEEKS ? LINES.done : (planned === 'rest' && !todayDone.length) ? LINES.rest : LINES[ph.id];

  let planNote = '';
  if (wNum === 0) planNote = `Primeiro treino: segunda, ${fmtDate(P.start)}. Pode testar antes; treinos de teste não contam na sequência.`;
  else if (todayDone.some(countsForProgram)) planNote = `✓ Treino de hoje feito (${P.workouts[todayDone[todayDone.length - 1].workout].name}). Próximo da sequência:`;
  else if (planned === 'rest') planNote = 'Hoje é descanso no plano. Se faltou algum dia, dá para adiantar o próximo:';
  else if (planned === 'free') planNote = 'Sábado livre. Próximo treino pendente:';
  else if (planned && planned !== nextKey) planNote = `No calendário seria ${P.workouts[planned].name}, mas a sequência não pula treino. Próximo pendente:`;

  const sat = now.getDay() === 6 && plan.saturday;
  const stale = isStale(active);
  const mini = svg => svg.replace('<svg', '<svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2"');

  el.innerHTML = `
    <div class="top-hello">
      <div class="row between"><div class="eyebrow">${fmtDate(now, true)}</div>${streak ? `<span class="tag org">${mini(ICON.fire)} ${streak === 1 ? '1 semana perfeita' : `${streak} semanas seguidas`}</span>` : ''}</div>
      <h1>${hello}, ${esc(first)}</h1>
      <div class="phase-pill"><span class="dotp"></span>${wl.title} · ${wl.sub}</div>
      <p class="hello-line">${line}</p>
    </div>
    <div class="stack mt">
      ${active ? `
        <div class="card hero">
          <div class="card-title">${stale ? 'Treino esquecido aberto' : 'Treino em andamento'} <span class="tag acc num" data-elapsed="${active.startedAt}">${hhmmss(Date.now() - active.startedAt)}</span></div>
          <h2 style="font-size:26px">${P.workouts[active.workout].name}</h2>
          ${stale ? `<p class="muted">Aberto desde ${fmtDate(active.date, true)}. Finalize para salvar o que foi feito.</p>` : ''}
          <div class="row gap mt">
            <button class="btn primary xl flex" data-resume>${ICON.play} Continuar</button>
            ${stale ? '<button class="btn xl" data-finishstale>Finalizar</button>' : ''}
          </div>
        </div>` : `
        <div class="card hero">
          <div class="card-title">Próximo treino ${wNum >= 1 && wNum <= TOTAL_WEEKS ? `<span class="num">${nProgram + 1}/${PLANNED_SESSIONS()}</span>` : ''}</div>
          <h2 style="font-size:30px">${next.name}</h2>
          ${planNote ? `<p class="plan-note">${planNote}</p>` : ''}
          <p class="muted">${next.focus} · ${nGroups} exercícios · ${nSets} séries · ~${estMin} min + ${plan.minutes} min esteira</p>
          <div class="row gap wrap">${next.exercises.slice(0, 4).map(e => `<span class="tag">${esc(e.name.split(' (')[0])}</span>`).join('')}${next.exercises.length > 4 ? `<span class="tag">+${next.exercises.length - 4}</span>` : ''}</div>
          <button class="btn primary xl block mt2" data-start="${nextKey}">${ICON.play} Começar treino</button>
        </div>`}

      <div class="card">
        <div class="card-title">${wNum >= 1 && wNum <= TOTAL_WEEKS ? `Semana ${wNum}` : 'Semana'} · ${strip.count}/4 treinos</div>
        <div class="week-strip">${strip.slots.map(s => `<div class="ws ${s.done ? 'on' : ''}"><div class="ws-dot">${s.done ? ICON.check : ''}</div><small>${P.workouts[s.key].name.replace('Superior', 'Sup.').replace('Inferior', 'Inf.')}</small></div>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin-bottom:0">${ph.brief || ''}</p>
      </div>

      ${weighToday ? `<div class="card tap reminder" data-weight><span class="rem-ico">⚖️</span><div class="flex"><b>Dia de pesagem</b><small>Em jejum, depois do banheiro. Toque para registrar.</small></div></div>` : ''}
      ${sat ? `<div class="card tap reminder" data-sat><span class="rem-ico">🚴</span><div class="flex"><b>Sábado · opcional</b><small>${esc(plan.saturday)}</small></div></div>` : ''}
      ${photos ? `<div class="card tap reminder" data-photos><span class="rem-ico">📸</span><div class="flex"><b>Fotos de progresso</b><small>A cada 2 semanas: frente, lado e costas.</small></div></div>` : ''}
      ${backupDue ? `<div class="card tap reminder" data-backup><span class="rem-ico">💾</span><div class="flex"><b>Hora do backup</b><small>${lastBackup ? `Último há ${Math.floor((Date.now() - lastBackup) / 86400000)} dias` : 'Você ainda não fez nenhum'}. Toque para exportar.</small></div></div>` : ''}

      <div class="card">
        <div class="card-title">Resumo do dia</div>
        <div class="grid2">
          <div class="row gap tap" data-go="diet">${ring(day.protein / t.protein, { size: 56, stroke: 6 })}<div><div class="muted" style="font-size:12px">Proteína</div><b class="num">${day.protein}/${t.protein} g</b></div></div>
          <div class="row gap tap" data-go="diet">${ring(day.water / 1000 / t.water, { size: 56, stroke: 6, cls: 'blue' })}<div><div class="muted" style="font-size:12px">Água</div><b class="num">${fmtNum(day.water / 1000, 1)}/${fmtNum(t.water, 1)} L</b></div></div>
          <div class="row gap tap" data-steps>${ring(day.steps / P.stepsGoal[1], { size: 56, stroke: 6, cls: 'blue' })}<div><div class="muted" style="font-size:12px">Passos</div><b class="num">${fmtNum(day.steps)}</b><small style="display:block;font-size:11px">meta 8–10 mil</small></div></div>
          <div class="row gap tap" data-cardio>${ring(cardioMin / plan.minutes, { size: 56, stroke: 6, cls: 'org' })}<div><div class="muted" style="font-size:12px">Cardio</div><b class="num">${cardioMin}/${plan.minutes} min</b></div></div>
        </div>
      </div>

      <div class="grid2">
        <div class="card tap" data-weight style="padding:16px">
          <div class="card-title">${mini(ICON.scale)} Peso</div>
          <div class="mid num">${w.last ? fmtNum(w.last.kg, 1) : '—'}<span class="unit">kg</span></div>
          <small>${w.avg7 ? 'média 7d ' + fmtNum(w.avg7, 1) : 'toque para registrar'}</small>
        </div>
        <div class="card" style="padding:16px">
          <div class="card-title">Até 31/12</div>
          <div class="mid num"><span data-count="${daysLeft}">${daysLeft}</span><span class="unit">dias</span></div>
          <small>meta ${fmtNum(P.goal.targetMin)}–${fmtNum(P.goal.targetMax)} kg</small>
        </div>
      </div>
      ${prof.why ? `<div class="quote">“${esc(prof.why)}”<small>— seu porquê</small></div>` : `<div class="card tap reminder" data-why><span class="rem-ico">✍️</span><div class="flex"><b>Qual é o seu porquê?</b><small>Escreva no Perfil o motivo de estar fazendo isso. Ele aparece aqui todo dia.</small></div></div>`}
    </div>`;

  el.onclick = async e => {
    const b = e.target.closest('[data-start],[data-resume],[data-finishstale],[data-go],[data-steps],[data-cardio],[data-weight],[data-sat],[data-photos],[data-backup],[data-why]');
    if (!b) return;
    if (b.dataset.start) return startSession(b.dataset.start);
    if (b.dataset.resume != null) return openSession();
    if (b.dataset.finishstale != null) { await openSession(); return finishFlow(); }
    if (b.dataset.go) return document.querySelector(`.tab[data-tab="${b.dataset.go}"]`).click();
    if (b.dataset.steps != null) return stepsSheet();
    if (b.dataset.cardio != null) {
      const s = todayDone[todayDone.length - 1];
      return openCardio(s && !s.cardio ? s.id : null, 'post');
    }
    if (b.dataset.sat != null) return openCardio(null, 'saturday');
    if (b.dataset.weight != null) return addWeightSheet(() => nav.refresh());
    if (b.dataset.photos != null) { setProgressTab('fotos'); return document.querySelector('.tab[data-tab="progress"]').click(); }
    if (b.dataset.backup != null) { const { doExport } = await import('./profile.js'); return doExport(); }
    if (b.dataset.why != null) return document.querySelector('.tab[data-tab="profile"]').click();
  };

  // conquistas desbloqueadas fora do treino (ex.: peso, fotos, proteína)
  newAchievements().then(list => list.forEach((a, i) => setTimeout(() => { haptic('heavy'); toast(`${a.icon} Conquista: ${a.title}`, 'ok'); }, 600 + i * 2400)));
}

// Passos do dia, com atalho para colar o número copiado do app Saúde
export function stepsSheet(onDone) {
  getDay().then(day => {
    const sh = sheet(`<h3>Passos de hoje</h3>
      <p class="muted">Copie o número no app Saúde e toque em <b>Colar</b>. Meta: ${fmtNum(P.stepsGoal[0])}–${fmtNum(P.stepsGoal[1])}.</p>
      <div class="row gap"><input class="field flex" data-steps inputmode="numeric" placeholder="0" value="${day.steps || ''}"><button class="btn" data-paste>Colar</button></div>
      <div class="row gap wrap mt">${[1000, 2000, 5000].map(v => `<button class="chip" data-add="${v}">+${fmtNum(v)}</button>`).join('')}</div>
      <div class="row gap mt2"><button class="btn ghost flex" data-close>Cancelar</button><button class="btn primary flex" data-ok>Salvar</button></div>`);
    const inp = sh.el.querySelector('[data-steps]');
    sh.el.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.paste != null) {
        try { const txt = await navigator.clipboard.readText(); const n = parseInt(txt.replace(/\D/g, '')); if (n) inp.value = n; else toast('Nada numérico copiado'); }
        catch (err) { toast('O iOS não liberou a colagem — cole no campo'); inp.focus(); }
      }
      if (b.dataset.add) inp.value = (parseInt(inp.value) || 0) + +b.dataset.add;
      if (b.dataset.ok != null) {
        const d = await getDay(); d.steps = parseInt(inp.value) || 0;
        if (d.steps >= P.stepsGoal[0]) d.checks.steps = true;
        await saveDay(d); sh.close(); haptic(); toast('Passos salvos ✓', 'ok');
        onDone ? onDone() : nav.refresh();
      }
    };
  });
}
