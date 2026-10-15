// Cardio: esteira pós-treino com contagem regressiva, lembretes e passos do dia.
import { db, kv } from '../db.js';
import { P, effWeek, cardioForWeek, dateKey } from '../program.js';
import { Countdown, beep, flash, keepAwake, unlockAudio, mmss } from '../timer.js';
import { nav, header, toast, esc, ICON, fmtNum } from '../ui.js';
import { getDay, saveDay } from '../day.js';

export async function openCardio(sessionId = null, kind = 'post') {
  await nav.push((el, v) => renderCardio(el, v, sessionId, kind), { fullscreen: true, kind: 'cardio', onClose: () => stopUI() });
}

let cd = null;
function stopUI() { if (cd) { cd.stop(); cd = null; } }

async function renderCardio(el, view, sessionId, kind) {
  stopUI();
  const week = effWeek();
  const plan = cardioForWeek(week);
  const isSat = kind === 'saturday';
  const minutes = isSat ? 35 : plan.minutes;
  const day = await getDay();
  const session = sessionId ? await db.get('sessions', sessionId) : null;
  let t = await kv.get('cardioTimer', null);
  if (t && t.key !== (sessionId || kind + ':' + dateKey())) t = null;
  const dur = t ? t.duration : minutes * 60;
  const remaining = t ? (t.paused != null ? t.paused / 1000 : Math.max(0, (t.endAt - Date.now()) / 1000)) : dur;
  const running = t && t.paused == null && remaining > 0;
  const [g0, g1] = P.stepsGoal;
  const done = session?.cardio?.done;

  el.innerHTML = `
    ${header('Cardio', { sub: `Semana ${week} · ${isSat ? 'Sábado (opcional)' : 'Pós-musculação'}` })}
    <div class="card hero center">
      <div class="eyebrow">${isSat ? esc(plan.saturday || 'Cardio livre') : 'Esteira inclinada'}</div>
      <div class="cardio-big mt num" data-cd>${mmss(remaining)}</div>
      <div class="pbar mt"><i data-pb style="width:${(1 - remaining / dur) * 100}%;animation:none"></i></div>
      <div class="grid3 mt">
        <div class="stat"><div class="lbl">Tempo</div><div class="val num">${Math.round(dur / 60)}<span class="unit">min</span></div></div>
        <div class="stat"><div class="lbl">Velocidade</div><div class="val num">${plan.speed}<span class="unit">km/h</span></div></div>
        <div class="stat"><div class="lbl">Inclinação</div><div class="val" style="font-size:14px">${esc(plan.incline)}</div></div>
      </div>
      ${done ? '<div class="tag acc mt">✓ Cardio registrado</div>' : ''}
    </div>
    <div class="card mt"><div class="card-title">Lembretes</div>
      <ul class="tips" style="margin:0;padding-left:20px">${P.cardioTips.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    ${sessionId ? `<div class="info-box mt">🚶 Caminhada de deslocamento (${P.commuteMinutes} min ida + volta) já registrada com o treino.</div>` : ''}
    <div class="card mt">
      <div class="card-title">Passos de hoje <span class="num">${fmtNum(day.steps)} / ${fmtNum(g0)}–${fmtNum(g1)}</span></div>
      <div class="pbar blue"><i style="width:${Math.min(100, day.steps / g1 * 100)}%"></i></div>
      <div class="row gap mt"><input class="field flex" data-steps inputmode="numeric" placeholder="Passos do app Saúde" value="${day.steps || ''}"><button class="btn primary" data-savesteps>Salvar</button></div>
    </div>
    <div class="dock">
      ${running ? `<button class="btn xl" data-pause>Pausar</button>` : `<button class="btn xl" data-start>${ICON.play} ${t ? 'Retomar' : 'Iniciar'}</button>`}
      <button class="btn primary xl flex" data-finish>${ICON.check} Concluir cardio</button>
    </div>`;

  const key = sessionId || kind + ':' + dateKey();
  const cdEl = el.querySelector('[data-cd]'), pb = el.querySelector('[data-pb]');
  const attach = (tt) => {
    cd = new Countdown({ endAt: tt.endAt, duration: tt.duration, warnAt: 60,
      onTick: r => { cdEl.textContent = mmss(r); pb.style.width = (1 - r / tt.duration) * 100 + '%'; },
      onWarn: () => { beep({ freq: 700 }); toast('Último minuto!'); },
      onDone: () => { beep({ count: 3, freq: 980 }); flash(); save(Math.round(tt.duration / 60)); } });
  };
  if (running) attach(t);

  const save = async (mins) => {
    stopUI();
    await kv.del('cardioTimer');
    const rec = { minutes: mins, incline: plan.incline, speed: plan.speed, done: true, at: Date.now(), type: isSat ? 'saturday' : 'treadmill' };
    if (sessionId) { const s = await db.get('sessions', sessionId); s.cardio = rec; await db.put('sessions', s); }
    else { const d = await getDay(); d.cardio.push(rec); await saveDay(d); }
    keepAwake(false);
    toast(`Cardio registrado: ${mins} min ✓`, 'ok');
    nav.pop();
  };

  el.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.start != null) {
      unlockAudio(); keepAwake(true);
      const tt = t && t.paused != null ? { key, duration: t.duration, endAt: Date.now() + t.paused } : { key, duration: dur, endAt: Date.now() + dur * 1000 };
      await kv.set('cardioTimer', tt);
      nav.refresh();
    }
    if (b.dataset.pause != null) { const tt = await kv.get('cardioTimer'); tt.paused = tt.endAt - Date.now(); await kv.set('cardioTimer', tt); nav.refresh(); }
    if (b.dataset.finish != null) {
      const tt = await kv.get('cardioTimer', null);
      const elapsed = tt ? Math.round((tt.duration - (tt.paused != null ? tt.paused : Math.max(0, tt.endAt - Date.now())) / 1000) / 60) : 0;
      save(elapsed > 0 ? elapsed : Math.round(dur / 60));
    }
    if (b.dataset.savesteps != null) {
      const d = await getDay(); d.steps = parseInt(el.querySelector('[data-steps]').value) || 0;
      if (d.steps >= g0) d.checks.steps = true;
      await saveDay(d); toast('Passos salvos'); nav.refresh();
    }
  };
}
