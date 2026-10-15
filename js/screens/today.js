// Tela "Hoje": fase atual, próximo treino pendente, resumo do dia, peso e contagem regressiva.
import { P, weekLabel, nextWorkoutKey, plannedFor, completedSessions, dateKey, parseKey, daysBetween, effWeek, cardioForWeek, groupsOf, setsFor, fmtDate } from '../program.js';
import { nav, esc, ICON, fmtNum } from '../ui.js';
import { ring } from '../charts.js';
import { getActive, startSession, openSession } from './session.js';
import { openCardio } from './cardio.js';
import { nutritionTargets, getProfile, currentWeight } from './diet.js';
import { addWeightSheet, photoDue, weekStreak, setProgressTab } from './progress.js';
import { getDay } from '../day.js';
import { hhmmss } from '../timer.js';

export async function renderToday(el) {
  const now = new Date();
  const prof = await getProfile();
  const wl = weekLabel(now);
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
  const due = await photoDue();
  const h = now.getHours();
  const hello = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const cardioMin = todayDone.reduce((s, x) => s + (x.cardio?.minutes || 0), 0) + day.cardio.reduce((s, c) => s + c.minutes, 0);
  const nGroups = groupsOf(nextKey).length;
  const nSets = next.exercises.reduce((s, e) => s + setsFor(e, now), 0);
  const estMin = Math.round(nSets * 2.6 + 5);

  let planNote = '';
  if (wl.week === 0) planNote = `Primeiro treino: segunda, ${fmtDate(P.start)}. Pode testar antes se quiser.`;
  else if (todayDone.length) planNote = `✓ Treino de hoje feito (${P.workouts[todayDone[todayDone.length - 1].workout].name}). Próximo da sequência:`;
  else if (planned === 'rest') planNote = 'Hoje é descanso no plano. Se faltou algum dia, dá para adiantar o próximo da sequência:';
  else if (planned === 'free') planNote = 'Sábado livre. Próximo treino pendente:';
  else if (planned && planned !== nextKey) planNote = `No calendário seria ${P.workouts[planned].name}, mas a sequência não pula treino. Próximo pendente:`;
  else planNote = '';

  const sat = now.getDay() === 6 && plan.saturday;

  el.innerHTML = `
    <div class="top-hello">
      <div class="row between"><div class="eyebrow">${fmtDate(now, true)}</div>${streak ? `<span class="tag org">${ICON.fire.replace('<svg', '<svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2"')} ${streak} sem.</span>` : ''}</div>
      <h1>${hello}${prof.name ? ', ' + esc(prof.name.split(' ')[0]) : ''}</h1>
      <div class="phase-pill"><span class="dotp"></span>${wl.title} · ${wl.sub}</div>
    </div>
    <div class="stack mt">
      ${active ? `
        <div class="card hero tap" data-resume>
          <div class="card-title">Treino em andamento <span class="tag acc num" data-elapsed="${active.startedAt}">${hhmmss(Date.now() - active.startedAt)}</span></div>
          <h2 style="font-size:26px">${P.workouts[active.workout].name}</h2>
          <button class="btn primary xl block mt">${ICON.play} Continuar treino</button>
        </div>` : `
        <div class="card hero">
          <div class="card-title">Próximo treino</div>
          <h2 style="font-size:30px">${next.name}</h2>
          ${planNote ? `<p style="font-size:14px;color:#cfd3da">${planNote}</p>` : ''}
          <p class="muted">${next.focus} · ${nGroups} exercícios · ${nSets} séries · ~${estMin} min + ${plan.minutes} min esteira</p>
          <div class="row gap wrap">${next.exercises.slice(0, 4).map(e => `<span class="tag">${esc(e.name.split(' (')[0])}</span>`).join('')}${next.exercises.length > 4 ? `<span class="tag">+${next.exercises.length - 4}</span>` : ''}</div>
          <button class="btn primary xl block mt2" data-start="${nextKey}">${ICON.play} Começar treino</button>
        </div>`}

      ${sat ? `<div class="card tap" data-sat><div class="card-title">Sábado · opcional</div><b>${esc(plan.saturday)}</b><p class="muted" style="margin-bottom:0">Toque para abrir o timer de cardio.</p></div>` : ''}
      ${due ? `<div class="card tap" data-photos><div class="card-title">Lembrete</div><b>📸 Fotos de progresso</b><p class="muted" style="margin-bottom:0">A cada 2 semanas: frente, lado e costas.</p></div>` : ''}

      <div class="card">
        <div class="card-title">Resumo do dia</div>
        <div class="grid2">
          <div class="row gap tap" data-go="diet">${ring(day.protein / t.protein, { size: 56, stroke: 6 })}<div><div class="lbl muted" style="font-size:12px">Proteína</div><b class="num">${day.protein}/${t.protein} g</b></div></div>
          <div class="row gap tap" data-go="diet">${ring(day.water / 1000 / t.water, { size: 56, stroke: 6, cls: 'blue' })}<div><div class="lbl muted" style="font-size:12px">Água</div><b class="num">${fmtNum(day.water / 1000, 1)}/${fmtNum(t.water, 1)} L</b></div></div>
          <div class="row gap tap" data-steps>${ring(day.steps / P.stepsGoal[1], { size: 56, stroke: 6, cls: 'blue' })}<div><div class="lbl muted" style="font-size:12px">Passos</div><b class="num">${fmtNum(day.steps)}</b><small style="display:block;font-size:11px">meta 8–10 mil</small></div></div>
          <div class="row gap tap" data-cardio>${ring(cardioMin / plan.minutes, { size: 56, stroke: 6, cls: 'org' })}<div><div class="lbl muted" style="font-size:12px">Cardio</div><b class="num">${cardioMin}/${plan.minutes} min</b></div></div>
        </div>
      </div>

      <div class="grid2">
        <div class="card tap" data-weight style="padding:16px">
          <div class="card-title">${ICON.scale.replace('<svg', '<svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2"')} Peso</div>
          <div class="mid num">${w.last ? String(w.last.kg).replace('.', ',') : '—'}<span class="unit">kg</span></div>
          <small>${w.avg7 ? 'média 7d ' + fmtNum(w.avg7, 1) : 'toque para registrar'}</small>
        </div>
        <div class="card" style="padding:16px">
          <div class="card-title">Até 31/12</div>
          <div class="mid num"><span data-count="${daysLeft}">${daysLeft}</span><span class="unit">dias</span></div>
          <small>meta ${P.goal.targetMin}–${P.goal.targetMax} kg</small>
        </div>
      </div>
    </div>`;

  el.onclick = async e => {
    const b = e.target.closest('[data-start],[data-resume],[data-go],[data-steps],[data-cardio],[data-weight],[data-sat],[data-photos]');
    if (!b) return;
    if (b.dataset.start) return startSession(b.dataset.start);
    if (b.dataset.resume != null) return openSession();
    if (b.dataset.go) return document.querySelector(`.tab[data-tab="${b.dataset.go}"]`).click();
    if (b.dataset.steps != null || b.dataset.cardio != null) {
      const s = todayDone[todayDone.length - 1];
      return openCardio(s && !s.cardio ? s.id : null, 'post');
    }
    if (b.dataset.sat != null) return openCardio(null, 'saturday');
    if (b.dataset.weight != null) return addWeightSheet(() => nav.refresh());
    if (b.dataset.photos != null) { setProgressTab('fotos'); document.querySelector('.tab[data-tab="progress"]').click(); }
  };
}
