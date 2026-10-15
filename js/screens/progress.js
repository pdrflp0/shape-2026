// Progresso: peso (média semanal, ritmo, alertas), exercícios (carga, 1RM, volume, recordes), fotos, medidas, heatmap.
import { db } from '../db.js';
import { P, dateKey, parseKey, addDays, fmtDate, fmtShort, completedSessions, countsForProgram, daysBetween, phaseForWeek, PLANNED_SESSIONS, TOTAL_WEEKS } from '../program.js';
import { historyFor, histKey, sessionStats, recordsFor, fmtKg } from '../progression.js';
import { lineChart, barChart } from '../charts.js';
import { nav, header, sheet, toast, esc, ICON, fmtNum, confirmSheet, compressImage, pickImage, blobURL, $$ } from '../ui.js';

let tab = 'peso';
let selEx = null;
export const setProgressTab = t => { tab = t; };

// ---------- Cálculos de peso ----------
export async function weightStats() {
  const ws = (await db.all('weights')).sort((a, b) => a.id < b.id ? -1 : 1);
  // médias por semana do programa (segunda a domingo)
  const start = parseKey(P.start);
  const byWeek = new Map();
  for (const w of ws) {
    const wk = Math.floor(daysBetween(start, parseKey(w.id)) / 7);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(w.kg);
  }
  const weekly = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([wk, arr]) => ({
    wk, avg: arr.reduce((s, x) => s + x, 0) / arr.length, n: arr.length, mid: addDays(start, wk * 7 + 3),
  }));
  // ritmo: diferença entre médias semanais consecutivas
  const rates = [];
  for (let i = 1; i < weekly.length; i++) {
    const gap = weekly[i].wk - weekly[i - 1].wk;
    rates.push({ wk: weekly[i].wk, rate: (weekly[i - 1].avg - weekly[i].avg) / gap });
  }
  const lastRates = rates.slice(-2);
  const fast = lastRates.length === 2 && lastRates.every(r => r.rate > 1);
  const rate = rates.length ? rates[rates.length - 1].rate : null;
  return { ws, weekly, rates, rate, fast };
}

function rateVerdict(rate, goal) {
  if (rate == null) return { cls: '', txt: 'Registre pelo menos 2 semanas para ver o ritmo.' };
  if (rate > 1) return { cls: 'danger', txt: 'Rápido demais (> 1 kg/semana)' };
  if (rate >= goal.rateMin && rate <= goal.rateMax) return { cls: 'acc', txt: 'Dentro da meta (0,5–0,8 kg/semana)' };
  if (rate > goal.rateMax) return { cls: 'warn', txt: 'Um pouco acima da meta' };
  if (rate >= 0) return { cls: 'warn', txt: 'Abaixo da meta — ajuste a dieta/passos' };
  return { cls: 'danger', txt: 'Peso subindo nesta semana' };
}

export function addWeightSheet(onDone) {
  const sh = sheet(`<h3>Registrar peso</h3><p class="muted">Ideal: 3x por semana, em jejum, depois do banheiro.</p>
    <div class="form-grid"><div><label class="lbl">Peso (kg)</label><input class="field" data-kg inputmode="decimal" placeholder="83,0"></div>
    <div><label class="lbl">Data</label><input class="field" data-d type="date" value="${dateKey()}"></div></div>
    <div class="row gap mt2"><button class="btn ghost flex" data-close>Cancelar</button><button class="btn primary flex" data-ok>Salvar</button></div>`);
  setTimeout(() => sh.el.querySelector('[data-kg]').focus(), 350);
  sh.el.querySelector('[data-ok]').onclick = async () => {
    const kg = parseFloat(sh.el.querySelector('[data-kg]').value.replace(',', '.'));
    const d = sh.el.querySelector('[data-d]').value || dateKey();
    if (!(kg > 30 && kg < 300)) return toast('Peso inválido');
    await db.put('weights', { id: d, kg });
    sh.close(); toast('Peso registrado ✓', 'ok'); onDone && onDone();
  };
}

export async function renderProgress(el) {
  el.innerHTML = `
    <div class="top-hello"><div class="eyebrow">Progresso</div><h1>Sua evolução</h1></div>
    <div class="seg mt" data-seg>${[['peso', 'Peso'], ['ex', 'Exercícios'], ['fotos', 'Fotos'], ['medidas', 'Medidas'], ['agenda', 'Agenda']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="stack mt" data-body></div>`;
  const body = el.querySelector('[data-body]');
  if (tab === 'peso') await renderWeight(body);
  if (tab === 'ex') await renderExercises(body);
  if (tab === 'fotos') await renderPhotos(body);
  if (tab === 'medidas') await renderMeasures(body);
  if (tab === 'agenda') await renderCalendar(body);
  el.querySelector('[data-seg]').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; nav.refresh(undefined, { animate: true }); } };
}

async function renderWeight(body) {
  const g = P.goal;
  const { ws, weekly, rate, fast } = await weightStats();
  const v = rateVerdict(rate, g);
  const last = ws[ws.length - 1];
  const startW = ws.length ? ws[0].kg : g.startWeight;
  const tgt = (g.targetMin + g.targetMax) / 2;
  const daysLeft = Math.max(0, daysBetween(new Date(), parseKey(P.end)));
  const curAvg = weekly.length ? weekly[weekly.length - 1].avg : null;
  const needed = curAvg ? (curAvg - tgt) / Math.max(1, daysLeft / 7) : null;
  const proj = curAvg && rate != null ? curAvg - rate * (daysLeft / 7) : null;
  const pts = ws.map(w => ({ x: parseKey(w.id).getTime(), y: w.kg }));
  const avgPts = weekly.map(w => ({ x: w.mid.getTime(), y: w.avg }));
  const guide = [{ x: parseKey(P.start).getTime(), y: g.startWeight }, { x: parseKey(P.end).getTime(), y: tgt }];
  body.innerHTML = `
    <div class="card hero">
      <div class="card-title">Peso <button class="btn sm primary" data-addw>${ICON.plus} Registrar</button></div>
      <div class="row gap">
        <div class="flex"><div class="big num">${last ? fmtKg(last.kg) : '—'}<span class="unit">kg</span></div><small>${last ? 'último · ' + fmtDate(last.id, true) : 'sem registros'}</small></div>
        <div class="center"><div class="mid num">${curAvg ? fmtKg(Math.round(curAvg * 10) / 10) : '—'}</div><small>média semana</small></div>
      </div>
      <div class="mt">${lineChart([{ points: pts, cls: 'muted', line: false, r: 2.5 }, { points: avgPts, cls: '', r: 4 }],
        { band: [g.targetMin, g.targetMax], guide, extraY: [g.targetMin, g.startWeight], xMin: parseKey(P.start).getTime(), xMax: parseKey(P.end).getTime(), yFmt: v => fmtKg(Math.round(v)), empty: 'Registre seu peso para ver o gráfico' })}</div>
      <div class="legend"><span><i style="background:rgba(255,255,255,.35)"></i>diário</span><span><i style="background:var(--accent)"></i>média semanal</span><span><i style="background:rgba(61,220,132,.3)"></i>meta 76–78 kg</span><span><i style="background:transparent;border:1px dashed #888"></i>trajetória ideal</span></div>
    </div>
    ${fast ? `<div class="warn-box" style="color:var(--danger);background:rgba(255,90,95,.1);border-color:rgba(255,90,95,.3)">⚠️ Você perdeu mais de 1 kg/semana por 2 semanas seguidas. Aumente um pouco as calorias (≈ +150–200 kcal) para preservar músculo.</div>` : ''}
    <div class="grid2">
      <div class="stat"><div class="lbl">Ritmo atual</div><div class="val num">${rate == null ? '—' : (rate >= 0 ? '−' : '+') + fmtKg(Math.abs(Math.round(rate * 100) / 100))}<span class="unit">kg/sem</span></div><span class="tag ${v.cls}" style="margin-top:6px">${v.txt}</span></div>
      <div class="stat"><div class="lbl">Meta 31/12</div><div class="val num">${fmtKg(g.targetMin)}–${fmtKg(g.targetMax)}<span class="unit">kg</span></div><small>${needed != null ? `precisa de ~${fmtKg(Math.max(0, Math.round(needed * 100) / 100))} kg/sem` : `${daysLeft} dias restantes`}</small>${proj != null ? `<small style="display:block">no ritmo atual: <b class="${proj <= g.targetMax ? 'accent' : ''}">~${fmtKg(Math.round(proj * 10) / 10)} kg</b></small>` : ''}</div>
      <div class="stat"><div class="lbl">Total perdido</div><div class="val num">${last ? fmtKg(Math.round((startW - last.kg) * 10) / 10) : '—'}<span class="unit">kg</span></div><small>desde ${fmtKg(startW)} kg</small></div>
      <div class="stat"><div class="lbl">Registros esta semana</div><div class="val num">${ws.filter(w => daysBetween(parseKey(w.id), new Date()) < 7).length}/3</div><small>sugestão: 3x em jejum</small></div>
    </div>
    <div class="list">${ws.slice(-10).reverse().map(w => `<div class="li"><div class="li-main"><b class="num">${fmtKg(w.kg)} kg</b><small>${fmtDate(w.id, true)}</small></div><button class="icon-btn" data-delw="${w.id}" style="width:40px;height:40px" aria-label="Apagar">${ICON.trash}</button></div>`).join('')}</div>`;
  body.onclick = async e => {
    if (e.target.closest('[data-addw]')) addWeightSheet(() => nav.refresh());
    const d = e.target.closest('[data-delw]');
    if (d && await confirmSheet('Apagar registro?', fmtDate(d.dataset.delw, true), 'Apagar', true)) { await db.del('weights', d.dataset.delw); nav.refresh(); }
  };
}

async function renderExercises(body) {
  const sessions = await completedSessions();
  // todas as chaves com histórico (principal e alternativa)
  const keys = [];
  for (const w of Object.values(P.workouts)) for (const ex of w.exercises) {
    if (ex.unit === 's') continue;
    for (const v of ['main', 'alt']) { const k = histKey(ex.id, v); const h = historyFor(sessions, k); if (h.length || v === 'main') keys.push({ k, ex, v, h }); }
  }
  if (!selEx || !keys.find(x => x.k === selEx)) selEx = (keys.find(x => x.h.length) || keys[0]).k;
  const cur = keys.find(x => x.k === selEx);
  const name = x => x.v === 'alt' ? x.ex.alt.name + ' (alt.)' : x.ex.name;
  const pts = cur.h.map(h => ({ x: parseKey(h.date).getTime(), ...sessionStats(h) }));
  const rec = recordsFor(cur.h);
  body.innerHTML = `
    <select class="field" data-sel>${Object.values(P.workouts).map(w => `<optgroup label="${w.name}">${keys.filter(x => x.ex.workout === w.key).map(x => `<option value="${x.k}" ${x.k === selEx ? 'selected' : ''}>${esc(name(x))}${x.h.length ? ` (${x.h.length})` : ''}</option>`).join('')}</optgroup>`).join('')}</select>
    <div class="card"><div class="card-title">Carga máxima & 1RM estimado</div>
      ${lineChart([{ points: pts.map(p => ({ x: p.x, y: p.maxKg })), cls: 'org' }, { points: pts.map(p => ({ x: p.x, y: Math.round(p.e1 * 10) / 10 })), cls: '' }], { yFmt: v => Math.round(v), empty: 'Sem sessões deste exercício ainda' })}
      <div class="legend"><span><i style="background:var(--accent-2)"></i>carga máxima</span><span><i style="background:var(--accent)"></i>1RM estimado (Epley)</span></div></div>
    <div class="card"><div class="card-title">Volume por sessão (kg × reps)</div>
      ${barChart(pts.map(p => ({ y: p.vol, label: fmtShort(new Date(p.x)) })), { yFmt: v => v >= 1000 ? fmtNum(v / 1000, 1) + 'k' : Math.round(v) })}</div>
    <div class="card"><div class="card-title">Recordes pessoais</div>
      ${rec.bestKg ? `<div class="list">
        <div class="li"><div class="li-main"><small>Maior carga</small><b class="num">${fmtKg(rec.bestKg.kg)} kg × ${rec.bestKg.reps}</b></div><small>${fmtDate(rec.bestKg.date)}</small></div>
        <div class="li"><div class="li-main"><small>Melhor 1RM estimado</small><b class="num">${fmtKg(Math.round(rec.bestE.e * 10) / 10)} kg</b><small>${fmtKg(rec.bestE.kg)} kg × ${rec.bestE.reps}</small></div><small>${fmtDate(rec.bestE.date)}</small></div>
        <div class="li"><div class="li-main"><small>Maior volume</small><b class="num">${fmtNum(rec.bestVol.vol)} kg</b></div><small>${fmtDate(rec.bestVol.date)}</small></div></div>` : '<p class="muted" style="margin:0">Sem dados ainda.</p>'}
    </div>
    ${cur.h.length ? `<div class="card"><div class="card-title">Histórico</div><div class="list">${cur.h.slice().reverse().map(h => `<div class="li"><div class="li-main"><b class="num">${[...new Set(h.sets.map(s => fmtKg(s.kg)))].join('/')} kg × ${h.sets.map(s => s.reps).join(', ')}</b><small>${fmtDate(h.date, true)}${h.note ? ' · ' + esc(h.note) : ''}</small></div></div>`).join('')}</div></div>` : ''}
    <div class="card"><div class="card-title">Todos os recordes</div><div class="list">${keys.filter(x => x.h.length).map(x => { const r = recordsFor(x.h); return `<div class="li tap" data-pick="${x.k}"><div class="li-main"><b>${esc(name(x))}</b><small>1RM est. ${fmtKg(Math.round(r.bestE.e))} kg · máx ${fmtKg(r.bestKg.kg)} kg × ${r.bestKg.reps}</small></div><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>`; }).join('') || '<div class="li muted">Complete um treino para ver seus recordes.</div>'}</div></div>`;
  body.querySelector('[data-sel]').onchange = e => { selEx = e.target.value; nav.refresh(undefined, { animate: true }); };
  body.onclick = e => { const p = e.target.closest('[data-pick]'); if (p) { selEx = p.dataset.pick; nav.refresh(undefined, { animate: true }); nav.top().el.scrollTo({ top: 0, behavior: 'smooth' }); } };
}

const POSES = [['front', 'Frente'], ['side', 'Lado'], ['back', 'Costas']];
export async function photoDue() {
  const ps = await db.all('photos');
  if (!ps.length) return true;
  const last = ps.map(p => p.date).sort().pop();
  return daysBetween(parseKey(last), new Date()) >= 14;
}

let cmp = { a: null, b: null, pose: 'front' };
async function renderPhotos(body) {
  const ps = (await db.all('photos')).sort((a, b) => a.date < b.date ? -1 : 1);
  const dates = [...new Set(ps.map(p => p.date))];
  const due = await photoDue();
  if (!cmp.a || !dates.includes(cmp.a)) cmp.a = dates[0] || null;
  if (!cmp.b || !dates.includes(cmp.b)) cmp.b = dates[dates.length - 1] || null;
  const find = (d, pose) => ps.find(p => p.date === d && p.pose === pose);
  const A = find(cmp.a, cmp.pose), B = find(cmp.b, cmp.pose);
  body.innerHTML = `
    ${due ? `<div class="warn-box">📸 Hora das fotos de progresso (a cada 2 semanas): frente, lado e costas. Mesma luz, mesmo lugar, de manhã.</div>` : ''}
    <div class="card"><div class="card-title">Nova sessão de fotos · ${fmtDate(dateKey(), true)}</div>
      <div class="grid3">${POSES.map(([k, l]) => { const p = find(dateKey(), k); return `<button class="stack" data-shot="${k}" style="margin:0">${p ? `<img src="${blobURL(p.blob, p.id)}" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:12px">` : `<div class="ph" style="aspect-ratio:3/4;border-radius:12px;background:var(--bg-2);border:1px dashed var(--line);display:grid;place-items:center">${ICON.camera}</div>`}<small style="margin-top:6px">${l}</small></button>`; }).join('')}</div></div>
    <div class="card"><div class="card-title">Antes / depois</div>
      ${dates.length >= 1 ? `
        <div class="seg mb">${POSES.map(([k, l]) => `<button class="${cmp.pose === k ? 'on' : ''}" data-pose="${k}">${l}</button>`).join('')}</div>
        <div class="form-grid mb"><select class="field" data-a>${dates.map(d => `<option ${d === cmp.a ? 'selected' : ''} value="${d}">${fmtDate(d)}</option>`).join('')}</select>
          <select class="field" data-b>${dates.map(d => `<option ${d === cmp.b ? 'selected' : ''} value="${d}">${fmtDate(d)}</option>`).join('')}</select></div>
        ${A && B ? `<div class="compare" data-cmp style="--x:50%"><img src="${blobURL(A.blob, A.id)}" alt="antes"><img class="after" src="${blobURL(B.blob, B.id)}" alt="depois"><div class="knob"></div><span class="lb" style="left:10px">${fmtShort(cmp.a)}</span><span class="lb" style="right:10px">${fmtShort(cmp.b)}</span></div>`
          : '<p class="muted">Falta a foto desta pose em uma das datas.</p>'}` : '<p class="muted" style="margin:0">Tire suas primeiras fotos acima.</p>'}
    </div>
    ${dates.length ? `<div class="card"><div class="card-title">Galeria</div>${dates.slice().reverse().map(d => `<div class="row between mt"><b>${fmtDate(d, true)}</b><button class="btn sm ghost" data-deld="${d}">${ICON.trash}</button></div><div class="photo-grid mt">${POSES.map(([k]) => { const p = find(d, k); return p ? `<img src="${blobURL(p.blob, p.id)}">` : '<div class="ph"></div>'; }).join('')}</div>`).join('')}</div>` : ''}`;

  const c = body.querySelector('[data-cmp]');
  if (c) {
    const move = x => { const r = c.getBoundingClientRect(); c.style.setProperty('--x', Math.max(0, Math.min(100, (x - r.left) / r.width * 100)) + '%'); };
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); move(e.clientX); });
    c.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') move(e.clientX); });
  }
  body.onchange = e => { if (e.target.dataset.a != null) cmp.a = e.target.value; if (e.target.dataset.b != null) cmp.b = e.target.value; nav.refresh(); };
  body.onclick = async e => {
    const s = e.target.closest('[data-shot]');
    if (s) {
      const f = await pickImage({ capture: false }); if (!f) return;
      const blob = await compressImage(f, 1400);
      await db.put('photos', { id: dateKey() + ':' + s.dataset.shot, date: dateKey(), pose: s.dataset.shot, blob });
      toast('Foto salva ✓', 'ok'); return nav.refresh();
    }
    const p = e.target.closest('[data-pose]'); if (p) { cmp.pose = p.dataset.pose; return nav.refresh(); }
    const dd = e.target.closest('[data-deld]');
    if (dd && await confirmSheet('Apagar fotos?', `Todas as fotos de ${fmtDate(dd.dataset.deld)}`, 'Apagar', true)) {
      for (const [k] of POSES) await db.del('photos', dd.dataset.deld + ':' + k);
      nav.refresh();
    }
  };
}

async function renderMeasures(body) {
  const ms = (await db.all('measures')).sort((a, b) => a.id < b.id ? -1 : 1);
  const F = [['waist', 'Cintura', 'org'], ['arm', 'Braço', ''], ['chest', 'Peito', 'blue']];
  const first = ms[0], last = ms[ms.length - 1];
  body.innerHTML = `
    <div class="card"><div class="card-title">Nova medida (cm) · opcional</div>
      <div class="grid3">${F.map(([k, l]) => `<div><label class="lbl" style="margin-top:0">${l}</label><input class="field" data-m="${k}" inputmode="decimal" placeholder="${last && last[k] ? fmtKg(last[k]) : '—'}"></div>`).join('')}</div>
      <button class="btn primary block mt" data-savem>Salvar medidas de hoje</button></div>
    <div class="card"><div class="card-title">Evolução</div>
      ${lineChart(F.map(([k, , cls]) => ({ points: ms.filter(m => m[k]).map(m => ({ x: parseKey(m.id).getTime(), y: m[k] })), cls })), { empty: 'Sem medidas ainda' })}
      <div class="legend">${F.map(([, l, cls]) => `<span><i style="background:${cls === 'org' ? 'var(--accent-2)' : cls === 'blue' ? '#38bdf8' : 'var(--accent)'}"></i>${l}</span>`).join('')}</div></div>
    ${first && last && first !== last ? `<div class="grid3">${F.map(([k, l]) => `<div class="stat"><div class="lbl">${l}</div><div class="val num">${last[k] && first[k] ? (last[k] - first[k] > 0 ? '+' : '') + fmtKg(Math.round((last[k] - first[k]) * 10) / 10) : '—'}<span class="unit">cm</span></div></div>`).join('')}</div>` : ''}
    <div class="list">${ms.slice().reverse().map(m => `<div class="li"><div class="li-main"><b>${fmtDate(m.id, true)}</b><small>${F.map(([k, l]) => m[k] ? `${l} ${fmtKg(m[k])}` : '').filter(Boolean).join(' · ')}</small></div><button class="icon-btn" style="width:40px;height:40px" data-delm="${m.id}">${ICON.trash}</button></div>`).join('')}</div>`;
  body.onclick = async e => {
    if (e.target.closest('[data-savem]')) {
      const rec = { id: dateKey() };
      $$('[data-m]', body).forEach(i => { const v = parseFloat(i.value.replace(',', '.')); if (v > 0) rec[i.dataset.m] = v; });
      if (Object.keys(rec).length < 2) return toast('Preencha ao menos uma medida');
      await db.put('measures', Object.assign(await db.get('measures', rec.id) || {}, rec)); toast('Medidas salvas ✓', 'ok'); nav.refresh();
    }
    const d = e.target.closest('[data-delm]'); if (d) { await db.del('measures', d.dataset.delm); nav.refresh(); }
  };
}

// Streak de semanas cumpridas (4 treinos na semana)
export async function weekStreak() {
  const ss = (await completedSessions()).filter(countsForProgram);
  const start = parseKey(P.start);
  const per = new Map();
  for (const s of ss) { const wk = Math.floor(daysBetween(start, parseKey(s.date)) / 7); if (wk >= 0) per.set(wk, (per.get(wk) || 0) + 1); }
  const curWk = Math.floor(daysBetween(start, new Date()) / 7);
  let streak = 0;
  // a semana atual conta se já estiver cumprida; senão começa da anterior
  let w = (per.get(curWk) || 0) >= 4 ? curWk : curWk - 1;
  while (w >= 0 && (per.get(w) || 0) >= 4) { streak++; w--; }
  return { streak, per, curWk };
}

async function renderCalendar(body) {
  const ss = await completedSessions();
  const prog = ss.filter(countsForProgram);
  const days = await db.all('days');
  const trained = new Set(ss.map(s => s.date));
  const cardioDays = new Set(days.filter(d => d.cardio && d.cardio.length).map(d => d.id));
  const { streak, curWk } = await weekStreak();
  const { weekly } = await weightStats();
  const start = parseKey(P.start);
  const today = dateKey();
  let grid = '<span></span>' + ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(d => `<span class="center">${d}</span>`).join('');
  for (let w = 0; w < TOTAL_WEEKS; w++) {
    grid += `<span>S${w + 1}</span>`;
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w * 7 + d), k = dateKey(day);
      const out = k > P.end;
      grid += `<div class="c ${trained.has(k) ? 't1' : cardioDays.has(k) ? 't2' : ''} ${k === today ? 'today' : ''} ${out ? 'out' : ''}" style="animation-delay:${(w * 7 + d) * 8}ms" title="${fmtShort(day)}"></div>`;
    }
  }
  // resumo de cada semana do programa (da mais recente para a primeira)
  const weeks = [];
  for (let w = Math.min(curWk, TOTAL_WEEKS - 1); w >= 0; w--) {
    const w0 = dateKey(addDays(start, w * 7)), w1 = dateKey(addDays(start, w * 7 + 6));
    const inW = x => x >= w0 && x <= w1;
    const sw = prog.filter(s => inW(s.date));
    const dw = days.filter(d => inW(d.id));
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const wt = weekly.find(x => x.wk === w), wtPrev = weekly.find(x => x.wk === w - 1);
    const feel = avg(sw.filter(s => s.feel).map(s => s.feel));
    weeks.push({
      w: w + 1, phase: phaseForWeek(w + 1).name, n: sw.length,
      vol: sw.reduce((a, s) => a + (s.volume || 0), 0),
      kg: wt ? wt.avg : null, dkg: wt && wtPrev ? wt.avg - wtPrev.avg : null,
      prot: avg(dw.filter(d => d.protein > 0).map(d => d.protein)),
      steps: avg(dw.filter(d => d.steps > 0).map(d => d.steps)),
      cardio: sw.reduce((a, s) => a + (s.cardio ? s.cardio.minutes : 0), 0) + dw.reduce((a, d) => a + (d.cardio || []).reduce((x, c) => x + c.minutes, 0), 0),
      prs: sw.reduce((a, s) => a + (s.prs ? s.prs.length : 0), 0),
      feel: feel ? ['😫', '😕', '😐', '🙂', '🔥'][Math.round(feel) - 1] : '',
    });
  }
  const total = prog.length, planned = PLANNED_SESSIONS();
  body.innerHTML = `
    <div class="grid2">
      <div class="stat"><div class="lbl">${ICON.fire} Sequência</div><div class="val num">${streak}<span class="unit">semana(s)</span></div><small>com os 4 treinos</small></div>
      <div class="stat"><div class="lbl">Treinos feitos</div><div class="val num">${total}<span class="unit">/ ${planned}</span></div><small>${Math.round(total / planned * 100)}% do programa</small></div>
    </div>
    <div class="card"><div class="card-title">Mapa de treinos · ${fmtShort(P.start)} a ${fmtShort(P.end)}</div><div class="heat">${grid}</div>
      <div class="legend mt"><span><i style="background:var(--accent)"></i>musculação</span><span><i style="background:rgba(56,189,248,.6)"></i>só cardio</span><span><i style="background:var(--bg-2);border:1px solid #fff"></i>hoje</span></div></div>
    ${weeks.length ? `<div class="card"><div class="card-title">Semana a semana</div>${weeks.map(x => `
      <div class="wk-row">
        <div class="row between"><b>Semana ${x.w} <span class="muted" style="font-weight:600">· ${x.phase}</span></b><span class="tag ${x.n >= 4 ? 'acc' : x.n ? '' : 'danger'}">${x.n}/4 treinos ${x.feel}</span></div>
        <div class="wk-grid">
          <span><small>Volume</small><b class="num">${x.vol ? fmtNum(x.vol / 1000, 1) + ' t' : '—'}</b></span>
          <span><small>Peso médio</small><b class="num">${x.kg ? fmtKg(Math.round(x.kg * 10) / 10) : '—'}${x.dkg != null ? ` <em class="${x.dkg <= 0 ? 'delta-up' : 'delta-down'}">${x.dkg <= 0 ? '−' : '+'}${fmtKg(Math.abs(Math.round(x.dkg * 10) / 10))}</em>` : ''}</b></span>
          <span><small>Proteína</small><b class="num">${x.prot ? Math.round(x.prot) + ' g' : '—'}</b></span>
          <span><small>Passos</small><b class="num">${x.steps ? fmtNum(x.steps / 1000, 1) + ' mil' : '—'}</b></span>
          <span><small>Esteira</small><b class="num">${x.cardio ? x.cardio + ' min' : '—'}</b></span>
          <span><small>Recordes</small><b class="num">${x.prs || '—'}</b></span>
        </div>
      </div>`).join('')}</div>` : ''}
    <div class="card-title mt">Histórico de treinos</div>
    <div class="list">${ss.slice().reverse().slice(0, 30).map(s => `<div class="li tap" data-sess="${s.id}"><div class="li-main"><b>${P.workouts[s.workout] ? P.workouts[s.workout].name : s.workout}${s.test ? ' <span class="tag">teste</span>' : ''}</b><small>${fmtDate(s.date, true)} · ${Math.round((s.endedAt - s.startedAt) / 60000)} min · ${fmtNum(s.volume)} kg${s.cardio ? ` · cardio ${s.cardio.minutes} min` : ''}</small></div><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>`).join('') || '<div class="li muted">Nenhum treino ainda.</div>'}</div>`;
  body.onclick = async e => {
    const s = e.target.closest('[data-sess]'); if (!s) return;
    const { renderSessionDetail } = await import('./workouts.js');
    nav.push(el => renderSessionDetail(el, s.dataset.sess), { fullscreen: true });
  };
}
