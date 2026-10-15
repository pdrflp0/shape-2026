// Treinos: os 4 treinos, periodização, biblioteca de exercícios e detalhe de sessões passadas.
import { db } from '../db.js';
import { P, nextWorkoutKey, groupsOf, setsFor, rirFor, effWeek, phaseForWeek, cardioForWeek, weekOf, completedSessions, fmtDate, TOTAL_WEEKS, parseKey, addDays, fmtShort } from '../program.js';
import { historyFor, histKey, recordsFor, fmtKg, variantDef } from '../progression.js';
import { figureSVG, animateFigures } from '../figures.js';
import { nav, header, esc, ICON, fmtNum, confirmSheet } from '../ui.js';
import { startSession } from './session.js';
import { hhmmss } from '../timer.js';

const DAYS = { UA: 'Segunda', LA: 'Terça', UB: 'Quinta', LB: 'Sexta' };

export async function renderWorkouts(el) {
  const next = await nextWorkoutKey();
  const wk = effWeek();
  const cur = weekOf();
  el.innerHTML = `
    <div class="top-hello"><div class="eyebrow">Programa Upper/Lower · 4 dias</div><h1>Treinos</h1></div>
    <div class="stack mt">
      ${P.sequence.map(k => { const w = P.workouts[k]; return `
        <div class="card tap" data-w="${k}">
          <div class="row between"><span class="tag ${k === next ? 'acc' : ''}">${k === next ? 'Próximo' : DAYS[k]}</span><small>${w.exercises.length} exercícios</small></div>
          <h2 class="mt" style="font-size:24px">${w.name} <span class="muted" style="font-weight:600">· ${w.focus}</span></h2>
          <small>${w.exercises.map(e => e.name.split(' (')[0]).join(' · ')}</small>
        </div>`; }).join('')}

      <div class="card">
        <div class="card-title">Semana típica</div>
        <div class="list">${[['Seg', 'Superior A (força)'], ['Ter', 'Inferior A (força)'], ['Qua', 'Descanso'], ['Qui', 'Superior B (volume)'], ['Sex', 'Inferior B (volume)'], ['Sáb', 'Livre (cardio opcional)'], ['Dom', 'Descanso']].map(([d, t]) => `<div class="li" style="min-height:44px;padding:10px 14px"><b style="width:40px">${d}</b><span class="${/Descanso|Livre/.test(t) ? 'muted' : ''}">${t}</span></div>`).join('')}</div>
        <p class="muted" style="font-size:13px">Faltou um dia? O app não pula: o próximo da sequência A→B continua pendente.</p>
      </div>

      <div class="card">
        <div class="card-title">Periodização</div>
        <div class="list">${P.phases.map(ph => {
          const first = ph.weeks[0], last = ph.weeks[ph.weeks.length - 1];
          const d0 = addDays(parseKey(P.start), (first - 1) * 7), d1 = addDays(parseKey(P.start), last * 7 - 1);
          const on = ph.weeks.includes(cur);
          return `<div class="li" style="${on ? 'background:var(--accent-soft)' : ''}"><div class="li-main"><b>${on ? '● ' : ''}Sem. ${first}${last !== first ? '–' + last : ''} · ${ph.name}</b>
            <small>${fmtShort(d0)}–${fmtShort(d1 > parseKey(P.end) ? parseKey(P.end) : d1)} · ${ph.sets === 'two' ? '2 séries' : ph.sets === 'half' ? 'metade das séries' : 'séries completas'} · RIR ${ph.rir.compound}${ph.rir.isolation !== ph.rir.compound ? ' (isolados ' + ph.rir.isolation + ')' : ''} · ${ph.loadNote}</small></div></div>`;
        }).join('')}</div>
      </div>

      <div class="card">
        <div class="card-title">Cardio (esteira a 6 km/h, pós-treino)</div>
        <div class="list">${P.cardio.map(c => `<div class="li ${c.weeks.includes(cur) ? '' : ''}" style="${c.weeks.includes(cur) ? 'background:var(--accent-soft)' : ''}"><div class="li-main"><b>Sem. ${c.weeks[0]}${c.weeks.length > 1 ? '–' + c.weeks[c.weeks.length - 1] : ''} · ${c.minutes} min</b><small>Inclinação ${c.incline}${c.saturday ? ' · Sábado: ' + c.saturday : ''}</small></div></div>`).join('')}</div>
      </div>
    </div>`;
  el.onclick = e => { const c = e.target.closest('[data-w]'); if (c) nav.push(x => renderWorkout(x, c.dataset.w), { fullscreen: true }); };
}

async function renderWorkout(el, key) {
  const w = P.workouts[key];
  const next = await nextWorkoutKey();
  const now = new Date();
  el.innerHTML = `
    ${header(w.name, { sub: w.focus })}
    <div class="stack">
      ${key !== next ? `<div class="info-box">O próximo da sequência é <b>${P.workouts[next].name}</b>. Você pode começar este mesmo assim.</div>` : ''}
      <div class="list">${w.exercises.map((e, i) => `
        <div class="li tap" data-ex="${e.id}">
          <div class="fig-thumb">${figureSVG(e.anim)}</div>
          <div class="li-main"><b>${e.type === 'compound' ? '★ ' : ''}${esc(e.name)}</b>
            <small>${setsFor(e, now)} × ${e.reps[0] === e.reps[1] ? e.reps[0] : e.reps[0] + '–' + e.reps[1]}${e.unit === 's' ? ' s' : ''}${e.perSide ? '/perna' : ''} · RIR ${rirFor(e, now)}${e.superset ? ' · <span style="color:var(--accent-2)">bi-set</span>' : ''}</small></div>
          <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
        </div>`).join('')}</div>
    </div>
    <div class="dock"><button class="btn primary xl flex" data-start>${ICON.play} Começar ${w.name}</button></div>`;
  el.onclick = e => {
    const x = e.target.closest('[data-ex]'); if (x) return nav.push(v => renderExerciseInfo(v, x.dataset.ex));
    if (e.target.closest('[data-start]')) startSession(key);
  };
}

export async function renderExerciseInfo(el, id) {
  const ex = P.ex[id];
  const sessions = await completedSessions();
  const now = new Date();
  const histM = historyFor(sessions, histKey(id, 'main')), histA = historyFor(sessions, histKey(id, 'alt'));
  const rec = recordsFor(histM);
  el.innerHTML = `
    ${header(ex.name, { sub: P.workouts[ex.workout].name })}
    <div class="stack">
      <div class="fig-box">${figureSVG(ex.anim, { animated: true })}</div>
      <div class="row gap wrap"><span class="tag ${ex.type === 'compound' ? 'acc' : ''}">${ex.type === 'compound' ? '★ Composto' : 'Isolado'}</span>${ex.targets.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="target">
        <div class="stat"><div class="lbl">Séries hoje</div><div class="val num">${setsFor(ex, now)}<small style="font-size:11px"> de ${ex.sets}</small></div></div>
        <div class="stat"><div class="lbl">Faixa</div><div class="val num">${ex.reps[0] === ex.reps[1] ? ex.reps[0] : ex.reps[0] + '–' + ex.reps[1]}${ex.unit === 's' ? 's' : ''}</div></div>
        <div class="stat"><div class="lbl">RIR</div><div class="val num" style="font-size:${rirFor(ex, now).length > 4 ? 13 : 19}px">${rirFor(ex, now)}</div></div>
      </div>
      <div class="list">
        <div class="li"><div class="li-main"><small>Aparelho</small><b>${esc(ex.equip)}</b></div></div>
        <div class="li"><div class="li-main"><small>Alternativa</small><b>${esc(ex.alt.name)}</b><small>${esc(ex.alt.equip)}</small></div></div>
      </div>
      ${(ex.warnings || []).map(w => `<div class="warn-box">⚠️ ${esc(w.text)}</div>`).join('')}
      <div>
        <details class="fold" open><summary>Execução</summary><div class="fold-body"><ol>${ex.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div></details>
        <details class="fold"><summary>Erros comuns</summary><div class="fold-body"><ul>${ex.mistakes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></details>
        <details class="fold"><summary>Por que está no treino</summary><div class="fold-body"><p>${esc(ex.why)}</p></div></details>
      </div>
      <a class="btn block" href="https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' execução')}" target="_blank" rel="noopener">${ICON.video} Ver vídeo</a>
      <div class="card"><div class="card-title">Seu histórico</div>
        ${histM.length ? `<p style="margin:0">Recorde: <b>${fmtKg(rec.bestKg.kg)} kg × ${rec.bestKg.reps}</b> · 1RM est. <b>${fmtKg(Math.round(rec.bestE.e))} kg</b></p>
          <div class="list mt">${histM.slice(-5).reverse().map(h => `<div class="li"><div class="li-main"><b class="num">${[...new Set(h.sets.map(s => fmtKg(s.kg)))].join('/')} kg × ${h.sets.map(s => s.reps).join(', ')}</b><small>${fmtDate(h.date, true)}</small></div></div>`).join('')}</div>` : '<p class="muted" style="margin:0">Sem sessões ainda.</p>'}
        ${histA.length ? `<p class="muted">Alternativa: ${histA.length} sessão(ões) registradas separadamente.</p>` : ''}
      </div>
    </div>`;
  animateFigures(el);
}

export async function renderSessionDetail(el, id) {
  const s = await db.get('sessions', id);
  const w = P.workouts[s.workout];
  el.innerHTML = `
    ${header(w.name, { sub: fmtDate(s.date, true), right: `<button class="icon-btn" data-del aria-label="Apagar">${ICON.trash}</button>` })}
    <div class="grid3">
      <div class="stat"><div class="lbl">Duração</div><div class="val num" style="font-size:18px">${hhmmss(s.endedAt - s.startedAt)}</div></div>
      <div class="stat"><div class="lbl">Volume</div><div class="val num" style="font-size:18px">${fmtNum(s.volume)}</div></div>
      <div class="stat"><div class="lbl">Cardio</div><div class="val num" style="font-size:18px">${s.cardio ? s.cardio.minutes + ' min' : '—'}</div></div>
    </div>
    <div class="list mt">${Object.entries(s.entries).map(([exId, en]) => {
      const ex = P.ex[exId]; if (!ex) return '';
      const sets = en.sets.filter(x => x.done);
      return `<div class="li"><div class="li-main"><b>${esc(variantDef(ex, en.variant).name)}${en.variant === 'alt' ? ' <span class="tag">alt.</span>' : ''}</b>
        <small>${sets.length ? sets.map(x => ex.unit === 's' ? `${x.reps}s` : `${fmtKg(x.kg)}×${x.reps}${x.rir != null ? ` @${x.rir}` : ''}`).join(' · ') : 'não feito'}${en.note ? ' · 📝 ' + esc(en.note) : ''}</small></div></div>`;
    }).join('')}</div>
    ${s.prs && s.prs.length ? `<div class="card mt"><div class="card-title">Recordes</div>${s.prs.map(p => `<div>🏆 ${esc(p.name)} — ${p.kind}: ${p.value}</div>`).join('')}</div>` : ''}`;
  el.onclick = async e => {
    if (e.target.closest('[data-del]') && await confirmSheet('Apagar este treino?', 'O histórico e a sequência serão recalculados.', 'Apagar', true)) {
      await db.del('sessions', id); nav.pop();
    }
  };
}
