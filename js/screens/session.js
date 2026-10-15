// Treino ativo: lista de exercícios, tela do exercício, registro de séries, bi-sets, descanso e resumo.
import { db, kv, uid } from '../db.js';
import { P, dateKey, groupsOf, rirFor, restFor, activeWarnings, phaseOf, effWeek, completedSessions, weekLabel, programSessions, PLANNED_SESSIONS, fmtDate } from '../program.js';
import { suggest, histKey, variantDef, fmtKg, lastLine, todayLine, historyFor, recordsFor, sessionStats, getPrimeLoads, platesText, warmupSets, DEFAULT_PLATES } from '../progression.js';
import { Countdown, beep, flash, keepAwake, unlockAudio, mmss, hhmmss, speak } from '../timer.js';
import { figureSVG, animateFigures } from '../figures.js';
import { nav, header, sheet, toast, confirmSheet, confetti, esc, ICON, compressImage, pickImage, blobURL, fmtNum, haptic, $$ } from '../ui.js';
import { openCardio } from './cardio.js';
import { achievements, newAchievements } from '../achievements.js';
import { shareSessionCard } from '../share.js';

// ---------- Estado da sessão ativa (persistido para sobreviver a recarregar/fechar o app) ----------
export const getActive = () => kv.get('active', null);
const saveActive = s => kv.set('active', s);

// Todas as escritas na sessão ativa passam por esta fila: evita que dois toques rápidos
// (ex.: digitar a carga e marcar ✓) leiam o mesmo estado e um sobrescreva o outro.
let chain = Promise.resolve();
function update(fn) {
  const p = chain.then(async () => {
    const s = await getActive();
    if (!s) return null;
    await fn(s);
    await saveActive(s);
    return s;
  });
  chain = p.catch(() => {});
  return p;
}

async function buildEntry(ex, variant, sessions, primes, date) {
  const s = suggest(ex, variant, sessions, primes, date);
  return {
    variant,
    sets: Array.from({ length: s.n }, (_, i) => ({ kg: s.kg ?? '', reps: s.reps[i], rir: null, done: false })),
    note: '',
  };
}

// Se o program.json mudou com um treino aberto: cria entradas para exercícios novos
async function reconcile() {
  const s = await getActive();
  if (!s || !P.workouts[s.workout]) return;
  const missing = P.workouts[s.workout].exercises.filter(ex => !s.entries[ex.id]);
  if (!missing.length) return;
  const sessions = await completedSessions(), primes = await getPrimeLoads();
  const built = {};
  for (const ex of missing) built[ex.id] = await buildEntry(ex, 'main', sessions, primes, new Date(s.startedAt));
  await update(st => { Object.assign(st.entries, built); });
}

export async function startSession(workoutKey) {
  unlockAudio();
  const cur = await getActive();
  if (cur) {
    if (cur.workout === workoutKey) return openSession();
    const ok = await confirmSheet('Treino em andamento', `Você tem um treino de ${P.workouts[cur.workout].name} aberto. Descartar e começar ${P.workouts[workoutKey].name}?`, 'Descartar e começar', true);
    if (!ok) return;
    stopRest();
    await kv.del('active');
  }
  const sessions = await completedSessions();
  await askPrimeIfNeeded(workoutKey, sessions);
  const primes = await getPrimeLoads();
  const date = new Date();
  const s = {
    id: uid(), workout: workoutKey, date: dateKey(date), startedAt: Date.now(),
    week: effWeek(date), phase: phaseOf(date).id, entries: {}, rest: null, commute: P.commuteMinutes,
  };
  for (const ex of P.workouts[workoutKey].exercises) s.entries[ex.id] = await buildEntry(ex, 'main', sessions, primes, date);
  await saveActive(s);
  keepAwake(true);
  haptic();
  openSession();
}

// Primeira sessão: pergunta (opcional) as cargas do "prime"
async function askPrimeIfNeeded(workoutKey, sessions) {
  const asked = await kv.get('primeAsked', {});
  if (asked[workoutKey]) return;
  const primes = await getPrimeLoads();
  const exs = P.workouts[workoutKey].exercises.filter(e => e.unit !== 's' && e.load !== 'bodyweight' && !historyFor(sessions, e.id).length);
  if (!exs.length) return;
  await new Promise(res => {
    const sh = sheet(`<h3>Cargas do seu "prime"</h3>
      <p class="muted">Opcional. Quanto você usava em cada exercício na sua melhor fase? O app sugere ~55% disso para começar. Deixe em branco se não lembrar.</p>
      <div class="stack mt">${exs.map(e => `<div class="row gap"><div class="flex"><b style="font-size:15px">${esc(e.name)}</b><br><small>${e.reps[0]}–${e.reps[1]} reps</small></div>
        <input class="field" style="width:110px;text-align:center" inputmode="decimal" placeholder="kg" data-prime="${e.id}" value="${primes[e.id] ?? ''}"></div>`).join('')}</div>
      <div class="row gap mt2"><button class="btn ghost flex" data-skip>Pular</button><button class="btn primary flex" data-save>Salvar</button></div>`);
    const done = async save => {
      if (save) {
        $$('[data-prime]', sh.el).forEach(i => { const v = parseFloat(i.value.replace(',', '.')); if (v > 0) primes[i.dataset.prime] = v; else delete primes[i.dataset.prime]; });
        await kv.set('primeLoads', primes);
      }
      asked[workoutKey] = true; await kv.set('primeAsked', asked);
      sh.onClose = null; sh.close(); res();
    };
    sh.onClose = () => done(false);
    sh.el.querySelector('[data-skip]').onclick = () => done(false);
    sh.el.querySelector('[data-save]').onclick = () => done(true);
  });
}

// ---------- Progresso da sessão ----------
const exDone = (s, ex) => { const e = s.entries[ex.id]; return e && e.sets.length && e.sets.every(x => x.done); };
const groupDone = (s, g) => g.items.every(ex => exDone(s, ex));
function counts(s) {
  const gs = groupsOf(s.workout);
  return { total: gs.length, done: gs.filter(g => groupDone(s, g)).length, gs };
}
const lastSetAt = s => Math.max(0, ...Object.values(s.entries).flatMap(e => e.sets.filter(x => x.done && x.at).map(x => x.at)));
const STALE_MS = 4 * 3600 * 1000;
export const isStale = s => !!s && Date.now() - Math.max(s.startedAt, lastSetAt(s)) > STALE_MS;

// ---------- Tela: lista do treino ----------
export async function openSession() {
  await reconcile();
  // se já existe uma view de sessão na pilha, só volta para ela
  const idx = nav.stack.findIndex(v => v.opts.kind === 'session');
  if (idx >= 0) return nav.pop(nav.stack.length - 1 - idx);
  await nav.push(renderSession, { fullscreen: true, kind: 'session' });
  restoreRest();
}

async function renderSession(el) {
  const s = await getActive();
  if (!s) { el.innerHTML = header('Treino') + '<p class="muted center mt2">Nenhum treino ativo.</p>'; return; }
  const w = P.workouts[s.workout];
  const { total, done, gs } = counts(s);
  const media = await db.all('media');
  const photo = k => media.find(m => m.id === 'equip:' + k);
  const wl = weekLabel(new Date(s.startedAt));
  const nProgram = (await programSessions()).length + 1;
  const left = Object.entries(s.entries).reduce((n, [id, e]) => n + (P.ex[id] ? e.sets.filter(x => !x.done).length : 0), 0);

  const card = ex => {
    const en = s.entries[ex.id];
    if (!en) return '';
    const def = variantDef(ex, en.variant), k = histKey(ex.id, en.variant);
    const nd = en.sets.filter(x => x.done).length, ph = photo(k);
    const kgs = en.sets[0] && en.sets[0].kg !== '' ? (ex.unit === 's' ? '' : ` · ${en.sets[0].kg == 0 ? 'peso corporal' : fmtKg(en.sets[0].kg) + ' kg'}`) : '';
    return `<div class="ex-card tap ${exDone(s, ex) ? 'done' : ''}" data-open="${ex.superset || ex.id}">
      <div class="fig-thumb">${ph ? `<img src="${blobURL(ph.blob, ph.id + ph.updatedAt)}" alt="">` : figureSVG(def.anim)}</div>
      <div class="li-main"><b>${ex.type === 'compound' ? '★ ' : ''}${esc(def.name)}</b>
        <small>${en.sets.length} × ${ex.reps[0] === ex.reps[1] ? ex.reps[0] : ex.reps[0] + '–' + ex.reps[1]}${ex.unit === 's' ? ' s' : ''}${ex.perSide ? '/perna' : ''}${kgs}</small>
        <span class="prog">${nd}/${en.sets.length} séries${en.variant === 'alt' ? ' · <span class="accent">alternativa</span>' : ''}</span></div>
      <div class="okmark">${exDone(s, ex) ? ICON.check : `<svg viewBox="0 0 24 24" style="stroke:var(--dim)"><path d="M9 6l6 6-6 6"/></svg>`}</div></div>`;
  };

  el.innerHTML = `
    ${header(w.name, { sub: `${wl.title} · ${wl.sub}`, right: `<button class="btn sm" data-finish>Finalizar</button>` })}
    ${isStale(s) ? `<div class="warn-box mb">Este treino está aberto desde ${fmtDate(s.date, true)}. Esqueceu de finalizar? Toque em <b>Finalizar</b> para salvar o que foi feito (a duração vai até a última série) ou descartar.</div>` : ''}
    <div class="card hero">
      <div class="session-head">
        <div class="flex"><div class="card-title" style="margin:0">Tempo de treino</div>
          <div class="session-clock num" data-elapsed="${s.startedAt}">${hhmmss(Date.now() - s.startedAt)}</div>
          <small>${s.date >= P.start ? `Treino ${nProgram} de ${PLANNED_SESSIONS()}` : 'Antes do início do programa'}${left ? ` · ~${Math.round(left * 2.6)} min restantes` : ''}</small></div>
        <div class="center"><div class="mid num">${done}/${total}</div><small>concluídos</small></div>
      </div>
      <div class="pbar mt"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
    </div>
    <div class="stack mt">
      ${gs.map(g => g.superset
        ? `<div class="biset-box"><span class="tag org">Bi-set · descanso só depois do 2º</span>${g.items.map(card).join('')}</div>`
        : card(g.items[0])).join('')}
    </div>
    <div class="dock">
      ${done < total ? `<button class="btn primary xl flex" data-next>${done === 0 ? 'Começar' : 'Próximo exercício'} ${ICON.chev}</button>`
        : `<button class="btn primary xl flex" data-finish>Finalizar treino ${ICON.check}</button>`}
    </div>`;

  el.onclick = async e => {
    const o = e.target.closest('[data-open]');
    if (o) return openGroup(o.dataset.open);
    if (e.target.closest('[data-next]')) {
      const g = gs.find(g => !groupDone(s, g));
      if (g) openGroup(g.id);
    }
    if (e.target.closest('[data-finish]')) finishFlow();
  };
}

// ---------- Tela: exercício (ou bi-set) ----------
async function openGroup(groupId) {
  await nav.push((el, v) => renderGroup(el, v, groupId), { fullscreen: true, kind: 'exercise' });
}

async function renderGroup(el, view, groupId) {
  const s = await getActive();
  if (!s) return nav.pop();
  const gs = groupsOf(s.workout);
  const gi = gs.findIndex(g => g.id === groupId);
  const g = gs[gi];
  if (!g) return nav.pop();
  const sessions = await completedSessions();
  const primes = await getPrimeLoads();
  const notes = await kv.get('equipNotes', {});
  const settings = await kv.get('settings', {});
  const plates = settings.plates || DEFAULT_PLATES;
  const date = new Date(s.startedAt);

  const infos = [];
  for (const ex of g.items) {
    const en = s.entries[ex.id];
    const def = variantDef(ex, en.variant);
    const k = histKey(ex.id, en.variant);
    infos.push({
      ex, en, def, k,
      sug: suggest(ex, en.variant, sessions, primes, date, s.id),
      ph: await db.get('media', 'equip:' + k),
      rest: await restFor(ex),
      warns: activeWarnings(ex, date),
      notes: notes[k] || '',
      bar: ex.bar || settings.barKg || 20,
    });
  }
  const byId = Object.fromEntries(infos.map(i => [i.ex.id, i]));

  const top = i => {
    const { ex, en, def, sug } = i;
    const range = ex.reps[0] === ex.reps[1] ? `${ex.reps[0]}` : `${ex.reps[0]}–${ex.reps[1]}`;
    const rir = rirFor(ex, date);
    return `
      <div class="stack" data-ex="${ex.id}">
        ${g.superset ? `<div class="row gap"><span class="tag org">${g.items.indexOf(ex) === 0 ? 'A' : 'B'}</span><h2 class="flex">${esc(def.name)}</h2></div>` : `<h1 style="font-size:26px">${esc(def.name)}</h1>`}
        <div class="row gap wrap">
          <span class="tag ${ex.type === 'compound' ? 'acc' : ''}">${ex.type === 'compound' ? '★ Composto' : 'Isolado'}</span>
          ${ex.targets.map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
        <div class="fig-box">${figureSVG(def.anim, { animated: true })}</div>
        ${i.warns.map(w => `<div class="warn-box">⚠️ ${esc(w.text)}</div>`).join('')}
        <div class="row gap"><div class="flex" style="min-width:0"><small>Aparelho${en.variant === 'alt' ? ' (alternativa)' : ''}</small><div style="font-weight:650">${esc(def.equip)}</div>${i.notes ? `<small class="accent">📍 ${esc(i.notes)}</small>` : ''}</div></div>
        <button class="btn block ${en.variant === 'alt' ? '' : 'orange'}" data-swap="${ex.id}">${ICON.swap} ${en.variant === 'alt' ? 'Voltar para: ' + esc(ex.name) : 'Aparelho ocupado → ' + esc(ex.alt.name)}</button>
        <div class="target">
          <div class="stat"><div class="lbl">Séries</div><div class="val num">${en.sets.length}</div></div>
          <div class="stat"><div class="lbl">${ex.unit === 's' ? 'Tempo' : 'Reps'}</div><div class="val num">${range}${ex.unit === 's' ? 's' : ''}${ex.perSide ? '<small style="font-size:11px">/perna</small>' : ''}</div></div>
          <div class="stat"><div class="lbl">RIR alvo</div><div class="val num" style="font-size:${rir.length > 4 ? 13 : 19}px">${rir}</div></div>
        </div>
        <div class="suggest ${sug.action}">
          ${sug.last ? `<div class="line1">Última vez (${fmtDate(sug.last.date)}): <b>${lastLine(sug)}</b></div>` : `<div class="line1">Sem histórico ainda</div>`}
          <div class="line2">Hoje: ${todayLine(sug)}</div>
          <div class="line3">${esc(sug.msg)}</div>
          ${sug.last && sug.last.note ? `<div class="line1" style="margin-top:8px">📝 Última nota: ${esc(sug.last.note)}</div>` : ''}
        </div>
        ${g.superset ? '' : `<div class="row between"><small>Descanso: <b class="accent num">${i.rest} s</b> ${ex.type === 'compound' ? '(faixa 2–3 min)' : '(faixa 60–90 s)'}</small><button class="btn sm ghost" data-rest="${ex.id}">${ICON.timer} Editar</button></div>`}
      </div>`;
  };

  // aquecimento sugerido para compostos com carga
  const warm = infos.map(i => {
    if (i.ex.type !== 'compound' || i.ex.unit === 's') return '';
    const work = +(i.en.sets[0] && i.en.sets[0].kg) || 0;
    const ws = warmupSets(work, i.def, i.bar);
    if (!ws.length) return '';
    return `<details class="fold mt"><summary>🔥 Aquecimento sugerido${g.superset ? ' · ' + esc(i.def.name) : ''}</summary><div class="fold-body">
      <ol>${ws.map(w => `<li><b class="num">${fmtKg(w.kg)} kg × ${w.reps}</b>${i.def.load === 'barbell' ? ` <small>${platesText(w.kg, i.bar, plates)}</small>` : ''}</li>`).join('')}</ol>
      <small>Descanso curto entre elas (30–60 s). Não entram no histórico.</small></div></details>`;
  }).join('');

  // linhas de séries: intercaladas no bi-set
  const rows = [];
  const maxSets = Math.max(...infos.map(i => i.en.sets.length));
  for (let si = 0; si < maxSets; si++) {
    infos.forEach((info, xi) => {
      const set = info.en.sets[si];
      if (set) rows.push(setRow(info, si, set, g.superset ? (xi === 0 ? 'A' : 'B') : '', plates));
    });
  }
  const nextIdx = findNextSet(s, g);

  el.innerHTML = `
    ${header(g.superset ? 'Bi-set' : 'Exercício', { sub: `${gi + 1} de ${gs.length} · ${P.workouts[s.workout].name}`, right: `<span class="tag num" data-elapsed="${s.startedAt}">${hhmmss(Date.now() - s.startedAt)}</span>` })}
    <div class="stack">${infos.map(top).join(g.superset ? '<hr style="border:0;border-top:1px solid var(--line);margin:22px 0">' : '')}</div>
    ${warm}
    <div class="row between mt2"><h3 style="margin:0">Séries</h3>
      <div class="row gap"><button class="btn sm" data-delset aria-label="Remover série">− Série</button><button class="btn sm" data-addset aria-label="Adicionar série">+ Série</button></div></div>
    <div class="sets mt">${rows.join('')}</div>

    <div class="stack mt2">
      ${infos.map(i => `
        <div>
          <label class="lbl">Nota${g.superset ? ' · ' + esc(i.def.name) : ''} (opcional)</label>
          <div class="row gap wrap" style="margin-bottom:8px">${['Ombro incomodou', 'Pegada ruim', 'Muito fácil', 'Muito pesado', 'Boa técnica'].map(t => `<button class="chip xs" data-quicknote="${i.ex.id}">${t}</button>`).join('')}</div>
          <textarea class="field" data-note="${i.ex.id}" placeholder="ex.: ombro incomodou">${esc(i.en.note || '')}</textarea>
        </div>`).join('')}

      ${infos.map(i => `
        <div class="card">
          <div class="card-title">Meu aparelho${g.superset ? ' · ' + esc(i.def.name) : ''}</div>
          ${i.ph ? `<img class="equip-photo" src="${blobURL(i.ph.blob, i.ph.id + i.ph.updatedAt)}" alt="Foto do aparelho">` : '<p class="muted" style="margin-top:0">Tire uma foto para lembrar qual é a máquina e onde ela fica.</p>'}
          <button class="btn block mt" data-photo="${i.k}">${ICON.camera} ${i.ph ? 'Trocar foto' : 'Tirar/anexar foto do aparelho'}</button>
          <label class="lbl">Onde fica / ajustes</label>
          <input class="field" data-where="${i.k}" placeholder="ex.: fundo da sala, banco no furo 4" value="${esc(i.notes)}">
        </div>`).join('')}

      ${infos.map(i => `
        <div>
          ${g.superset ? `<div class="card-title mt">${esc(i.def.name)}</div>` : ''}
          <details class="fold"><summary>Execução</summary><div class="fold-body"><ol>${i.ex.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div></details>
          <details class="fold"><summary>Erros comuns</summary><div class="fold-body"><ul>${i.ex.mistakes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></details>
          <details class="fold"><summary>Por que está no treino</summary><div class="fold-body"><p>${esc(i.ex.why)}</p></div></details>
          <a class="btn block mt" href="https://www.youtube.com/results?search_query=${encodeURIComponent(i.def.name + ' execução')}" target="_blank" rel="noopener">${ICON.video} Ver vídeo</a>
        </div>`).join('')}
    </div>

    <div class="dock">
      <button class="btn xl" data-list aria-label="Lista">${ICON.back}</button>
      ${groupDone(s, g)
        ? (gi < gs.length - 1 ? `<button class="btn primary xl flex" data-go="${gs[gi + 1].id}">Próximo exercício ${ICON.chev}</button>` : `<button class="btn primary xl flex" data-finish>Finalizar treino ${ICON.check}</button>`)
        : `<button class="btn primary xl flex" data-donext>${ICON.check} Concluir série ${nextIdx ? nextIdx.label : ''}</button>`}
    </div>`;

  animateFigures(el);
  markNext(el, s, g);

  // ---------- Eventos ----------
  el.oninput = async e => {
    const t = e.target;
    if (t.dataset.kg == null && t.dataset.reps == null) return;
    const [exId, si] = (t.dataset.kg ?? t.dataset.reps).split(':');
    const isKg = t.dataset.kg != null;
    const st = await update(st => {
      const sets = st.entries[exId].sets, set = sets[+si];
      if (isKg) {
        set.kg = t.value === '' ? '' : parseFloat(t.value.replace(',', '.')) || 0;
        // a carga digitada vale também para as próximas séries ainda não feitas
        sets.forEach((x, i) => { if (i > +si && !x.done) { x.kg = set.kg; const o = el.querySelector(`[data-kg="${exId}:${i}"]`); if (o) o.value = t.value; } });
      } else set.reps = parseInt(t.value) || 0;
    });
    if (isKg && st) st.entries[exId].sets.forEach((x, i) => { if (i >= +si) refreshHint(el, byId[exId], i, x, plates); });
  };
  el.onchange = async e => {
    const t = e.target;
    if (t.dataset.note) update(st => { st.entries[t.dataset.note].note = t.value.trim(); });
    if (t.dataset.where) { const n = await kv.get('equipNotes', {}); n[t.dataset.where] = t.value.trim(); await kv.set('equipNotes', n); toast('Salvo'); }
  };
  el.onclick = async e => {
    const b = e.target.closest('button, a');
    if (!b) return;
    if (b.dataset.step) { haptic(); return stepValue(el, b); }
    if (b.dataset.check) return toggleSet(el, groupId, b.dataset.check, b);
    if (b.dataset.rir) {
      haptic();
      const [exId, si, v] = b.dataset.rir.split(':');
      const st = await update(st => { const set = st.entries[exId].sets[+si]; set.rir = set.rir === +v ? null : +v; });
      const cur = st.entries[exId].sets[+si].rir;
      $$(`[data-rir^="${exId}:${si}:"]`, el).forEach(x => x.classList.toggle('on', x.dataset.rir === `${exId}:${si}:${cur}`));
      return;
    }
    if (b.dataset.quicknote) {
      const ta = el.querySelector(`[data-note="${b.dataset.quicknote}"]`);
      ta.value = ta.value ? `${ta.value.replace(/[.\s]+$/, '')}. ${b.textContent}` : b.textContent;
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      haptic();
      return;
    }
    if (b.dataset.addset != null || b.dataset.delset != null) return changeSets(g, b.dataset.addset != null);
    if (b.dataset.timed) return timedSet(el, groupId, b.dataset.timed);
    if (b.dataset.donext != null) {
      const st = await getActive(); const n = findNextSet(st, g);
      if (n) { const btn = el.querySelector(`[data-check="${n.exId}:${n.si}"]`); btn.scrollIntoView({ block: 'center', behavior: 'smooth' }); return toggleSet(el, groupId, `${n.exId}:${n.si}`, btn); }
      return;
    }
    if (b.dataset.swap) return swapVariant(b.dataset.swap);
    if (b.dataset.photo) {
      const f = await pickImage();
      if (!f) return;
      const blob = await compressImage(f, 1200);
      await db.put('media', { id: 'equip:' + b.dataset.photo, blob, updatedAt: Date.now() });
      toast('Foto do aparelho salva', 'ok');
      return nav.refresh();
    }
    if (b.dataset.rest) return editRest(b.dataset.rest);
    if (b.dataset.list != null) return nav.pop();
    if (b.dataset.go) { await nav.pop(); return openGroup(b.dataset.go); }
    if (b.dataset.finish != null) return finishFlow();
  };
}

// Linha de dica abaixo de cada série pendente: última vez + anilhas por lado
function hintText(info, si, set, plates) {
  const parts = [];
  const prev = info.sug.last && info.sug.last.sets[si];
  if (prev && info.ex.unit !== 's') parts.push(`última: ${fmtKg(prev.kg)}×${prev.reps}`);
  if (info.def.load === 'barbell' && +set.kg > 0) { const t = platesText(+set.kg, info.bar, plates); if (t) parts.push(t); }
  return parts.join(' · ');
}
function refreshHint(el, info, si, set, plates) {
  const h = el.querySelector(`[data-hint="${info.ex.id}:${si}"]`);
  if (!h || set.done) return;
  const t = hintText(info, si, set, plates);
  h.textContent = t; h.hidden = !t;
}

function setRow(info, si, set, ab, plates) {
  const { ex, def } = info;
  const id = `${ex.id}:${si}`;
  const timed = ex.unit === 's';
  const kgStep = 2.5;
  const hint = hintText(info, si, set, plates);
  return `
    <div class="set-row ${set.done ? 'done' : ''} ${ab === 'B' ? 'bi-b' : ''}" data-row="${id}">
      <div class="sn">${si + 1}${ab}</div>
      ${timed
        ? `<div class="stepper-wrap"><small>tempo</small><button class="btn block" style="height:56px" data-timed="${id}">${ICON.play} ${set.reps}s</button></div>`
        : `<div class="stepper-wrap"><small>kg</small><div class="stepper">
            <button data-step="kg" data-id="${id}" data-d="-${kgStep}" aria-label="menos carga">−</button>
            <input data-kg="${id}" inputmode="decimal" value="${set.kg === '' ? '' : String(set.kg).replace('.', ',')}" placeholder="${def.load === 'bodyweight' ? 'PC' : 'kg'}">
            <button data-step="kg" data-id="${id}" data-d="${kgStep}" aria-label="mais carga">+</button></div></div>`}
      <div class="stepper-wrap"><small>${timed ? 'seg' : 'reps'}</small><div class="stepper">
        <button data-step="reps" data-id="${id}" data-d="${timed ? -5 : -1}" aria-label="menos">−</button>
        <input data-reps="${id}" inputmode="numeric" value="${set.reps}">
        <button data-step="reps" data-id="${id}" data-d="${timed ? 5 : 1}" aria-label="mais">+</button></div></div>
      <button class="check-btn" data-check="${id}" aria-label="Concluir série">${ICON.check}</button>
      <div class="set-hint" data-hint="${id}" ${set.done || !hint ? 'hidden' : ''}>${esc(hint)}</div>
      <div class="set-extra rir-pick" ${set.done ? '' : 'hidden'}>
        <small style="margin-right:4px">RIR</small>
        ${[0, 1, 2, 3, 4].map(v => `<button class="${set.rir === v ? 'on' : ''}" data-rir="${id}:${v}">${v === 4 ? '4+' : v}</button>`).join('')}
      </div>
    </div>`;
}

function stepValue(el, b) {
  const id = b.dataset.id, d = parseFloat(b.dataset.d);
  const inp = el.querySelector(b.dataset.step === 'kg' ? `[data-kg="${id}"]` : `[data-reps="${id}"]`);
  let v = parseFloat(String(inp.value).replace(',', '.')) || 0;
  v = Math.max(0, Math.round((v + d) * 10) / 10);
  inp.value = String(v).replace('.', ',');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

// + Série / − Série (no bi-set, vale para os dois exercícios)
async function changeSets(g, add) {
  haptic();
  let changed = 0;
  await update(st => {
    for (const ex of g.items) {
      const sets = st.entries[ex.id].sets;
      if (add) {
        const last = sets[sets.length - 1] || { kg: '', reps: ex.reps[0] };
        sets.push({ kg: last.kg, reps: last.reps, rir: null, done: false });
        changed++;
      } else if (sets.length > 1 && !sets[sets.length - 1].done) { sets.pop(); changed++; }
    }
  });
  toast(add ? 'Série extra adicionada' : changed ? 'Série removida' : 'Não dá para remover uma série já feita');
  nav.refresh();
}

function findNextSet(s, g) {
  const max = Math.max(...g.items.map(ex => s.entries[ex.id].sets.length));
  for (let si = 0; si < max; si++) for (const [xi, ex] of g.items.entries()) {
    const set = s.entries[ex.id].sets[si];
    if (set && !set.done) return { exId: ex.id, si, label: `${si + 1}${g.superset ? (xi ? 'B' : 'A') : ''}` };
  }
  return null;
}
function markNext(el, s, g) {
  $$('.set-row', el).forEach(r => r.classList.remove('next'));
  const n = findNextSet(s, g);
  if (n) { const r = el.querySelector(`[data-row="${n.exId}:${n.si}"]`); r && r.classList.add('next'); }
}

async function toggleSet(el, groupId, id, btn) {
  unlockAudio();
  const [exId, si] = id.split(':');
  const row = el.querySelector(`[data-row="${id}"]`);
  const kgI = row.querySelector('[data-kg]'), rI = row.querySelector('[data-reps]');
  let undone = false;
  const s = await update(st => {
    const set = st.entries[exId].sets[+si];
    if (set.done) { set.done = false; set.at = null; undone = true; return; }
    if (kgI) set.kg = kgI.value === '' ? 0 : parseFloat(kgI.value.replace(',', '.')) || 0;
    set.reps = parseInt(rI.value) || 0;
    set.done = true; set.at = Date.now();
  });
  if (!s) return;
  if (undone) return nav.refresh();
  haptic('heavy');
  row.classList.add('done');
  btn.classList.remove('anim'); void btn.offsetWidth; btn.classList.add('anim');
  row.querySelector('.rir-pick').hidden = false;
  const hint = row.querySelector('.set-hint'); if (hint) hint.hidden = true;

  const ex = P.ex[exId];
  const gs = groupsOf(s.workout);
  const g = gs.find(x => x.id === groupId);
  markNext(el, s, g);
  const isA = g.superset && g.items[0].id === exId;
  const partnerPending = isA && g.items[1] && s.entries[g.items[1].id].sets[+si] && !s.entries[g.items[1].id].sets[+si].done;

  if (partnerPending) {
    toast(`Agora: ${variantDef(g.items[1], s.entries[g.items[1].id].variant).name}`);
    setTimeout(() => nav.refresh(), 450);
    return;
  }
  const all = gs.every(x => groupDone(s, x));
  if (all) { setTimeout(() => nav.refresh(), 450); toast('Última série! Finalize o treino 🎉', 'ok'); return; }

  // descanso
  const dur = g.superset ? Math.max(...await Promise.all(g.items.map(restFor))) : await restFor(ex);
  const next = describeNext(s, gs, g);
  setTimeout(() => nav.refresh(), 450);
  startRest(dur, next);
}

function describeNext(s, gs, g) {
  const n = findNextSet(s, g);
  const line = (exId, si) => {
    const ex = P.ex[exId], en = s.entries[exId], set = en.sets[si];
    const def = variantDef(ex, en.variant);
    const load = ex.unit === 's' ? `${set.reps} s` : `${set.kg === '' ? '?' : set.kg == 0 ? 'PC' : fmtKg(set.kg) + ' kg'} × ${set.reps}`;
    const say = ex.unit === 's' ? `${set.reps} segundos` : `${set.kg > 0 ? fmtKg(set.kg) + ' quilos, ' : ''}${set.reps} repetições`;
    return { title: def.name, sub: `Série ${si + 1} de ${en.sets.length} · ${load}`, say: `${def.name}. Série ${si + 1}. ${say}.` };
  };
  if (n) return line(n.exId, n.si);
  const ng = gs.find(x => !groupDone(s, x));
  if (ng) { const l = line(ng.items[0].id, 0); return { title: 'Próximo: ' + l.title, sub: l.sub, say: 'Próximo exercício: ' + l.say }; }
  return { title: 'Fim do treino', sub: 'Finalize e vá para o cardio', say: 'Fim do treino.' };
}

// Série por tempo (prancha)
async function timedSet(el, groupId, id) {
  unlockAudio();
  const [exId, si] = id.split(':');
  const secs = parseInt(el.querySelector(`[data-reps="${id}"]`).value) || 40;
  let cd;
  const sh = sheet(`<div class="rest-sheet"><h3>${esc(P.ex[exId].name)} · série ${+si + 1}</h3>
    <div class="rest-ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg>
    <div class="tt"><b class="num">${secs}</b><small>segure firme</small></div></div>
    <div class="row gap"><button class="btn flex" data-close>Cancelar</button><button class="btn primary flex" data-ok>Terminei</button></div></div>`, {
    onMount(root) {
      let go = 3; // contagem de preparação
      const b = root.querySelector('.tt b'), fg = root.querySelector('.fg'), small = root.querySelector('.tt small');
      small.textContent = 'prepare-se'; b.textContent = go;
      const pre = setInterval(() => {
        go--; if (go > 0) { b.textContent = go; beep({ freq: 660, dur: 0.08 }); return; }
        clearInterval(pre); small.textContent = 'segure firme'; beep({ freq: 990, dur: 0.15 }); haptic();
        cd = new Countdown({ duration: secs, warnAt: 10,
          onTick: (r, d) => { b.textContent = Math.ceil(r); fg.style.strokeDashoffset = 326.7 * (1 - r / d); },
          onWarn: () => beep({ freq: 700, dur: 0.1 }),
          onDone: () => { beep({ count: 3 }); flash(); haptic('heavy'); finish(); } });
      }, 1000);
      sh.onClose = () => { clearInterval(pre); cd && cd.stop(); };
    } });
  const finish = async () => {
    sh.onClose = null; cd && cd.stop(); sh.close();
    await toggleSet(el, groupId, id, el.querySelector(`[data-check="${id}"]`));
  };
  sh.el.querySelector('[data-ok]').onclick = finish;
}

async function swapVariant(exId) {
  const s = await getActive();
  const en = s.entries[exId];
  const to = en.variant === 'alt' ? 'main' : 'alt';
  if (en.sets.some(x => x.done)) {
    const ok = await confirmSheet('Trocar exercício?', 'As séries já feitas deste exercício serão descartadas nesta sessão.', 'Trocar', true);
    if (!ok) return;
  }
  const sessions = await completedSessions();
  const fresh = await buildEntry(P.ex[exId], to, sessions, await getPrimeLoads(), new Date(s.startedAt));
  await update(st => { st.entries[exId] = Object.assign(fresh, { note: st.entries[exId].note }); });
  haptic();
  toast(to === 'alt' ? `Usando: ${P.ex[exId].alt.name}` : `Voltou para: ${P.ex[exId].name}`);
  nav.refresh();
}

async function editRest(exId) {
  const ex = P.ex[exId];
  const st = Object.assign({ restOverrides: {} }, await kv.get('settings', {}));
  const cur = await restFor(ex);
  const sh = sheet(`<h3>Descanso · ${esc(ex.name)}</h3><p class="muted">Padrão: ${ex.type === 'compound' ? '150 s (2–3 min)' : '75 s (60–90 s)'}</p>
    <div class="row gap wrap mt">${(ex.type === 'compound' ? [120, 150, 180] : [60, 75, 90]).map(v => `<button class="chip ${v === cur ? 'on' : ''}" data-v="${v}">${v} s</button>`).join('')}</div>
    <label class="lbl">Personalizado (s)</label><input class="field" inputmode="numeric" value="${cur}">
    <div class="row gap mt"><button class="btn ghost flex" data-reset>Padrão</button><button class="btn primary flex" data-ok>Salvar</button></div>`);
  const save = async v => { if (v) st.restOverrides[exId] = v; else delete st.restOverrides[exId]; await kv.set('settings', st); sh.close(); nav.refresh(); };
  sh.el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v) save(+b.dataset.v);
    if (b.dataset.reset != null) save(null);
    if (b.dataset.ok != null) save(parseInt(sh.el.querySelector('input').value) || cur);
  };
}

// ---------- Timer de descanso ----------
let rest = null; // { cd, sheet, mini }
async function startRest(duration, next) {
  stopRest();
  const r = { endAt: Date.now() + duration * 1000, duration, next };
  await update(st => { st.rest = r; });
  showRest(r, true);
}
export async function restoreRest() {
  const s = await getActive();
  if (!s || !s.rest) return;
  if (s.rest.endAt <= Date.now()) { await clearRestState(); return; }
  if (!rest) showRest(s.rest, false);
}
function stopRest() {
  if (!rest) return;
  rest.cd.stop();
  if (rest.sheet) { rest.sheet.onClose = null; rest.sheet.close(); }
  rest.mini && rest.mini.remove();
  rest = null;
}
const clearRestState = () => update(st => { st.rest = null; });

function showRest(r, open) {
  rest = { r };
  const C = 2 * Math.PI * 52;
  let ui = {};
  rest.cd = new Countdown({
    endAt: r.endAt, duration: r.duration, warnAt: 10,
    onTick: (rem, dur) => {
      if (ui.b) { ui.b.textContent = mmss(rem); ui.fg.style.strokeDashoffset = C * (1 - rem / dur); ui.ring.classList.toggle('warn', rem <= 10); }
      if (rest && rest.mini) rest.mini.querySelector('b').textContent = mmss(rem);
    },
    onWarn: () => { beep({ freq: 740, dur: 0.12 }); flash('warn'); haptic(); },
    onDone: async () => {
      // se o app ficou em segundo plano e voltou muito depois, só avisa sem alarde
      const late = Date.now() - (rest ? rest.cd.endAt : r.endAt) > 60000;
      if (!late) { beep({ freq: 980, dur: 0.22, count: 3 }); flash(); haptic('heavy'); speak(`Bora! ${r.next.say || r.next.title}`); }
      toast(late ? 'O descanso já tinha terminado' : 'Descanso terminado — bora! 💪', 'ok');
      stopRest(); await clearRestState();
    },
  });
  const openSheet = () => {
    rest.mini && rest.mini.remove(); rest.mini = null;
    rest.sheet = sheet(`<div class="rest-sheet">
      <div class="eyebrow">Descanso</div>
      <div class="rest-ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" cx="60" cy="60" r="52" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
        <div class="tt"><b class="num">${mmss(rest.cd.remaining())}</b><small>de ${mmss(rest.cd.duration)}</small></div></div>
      <div class="rest-next"><small>A seguir</small><div style="font-weight:700">${esc(r.next.title)}</div><small>${esc(r.next.sub)}</small></div>
      <div class="grid3"><button class="btn xl" data-d="-15">−15 s</button><button class="btn xl" data-d="15">+15 s</button><button class="btn xl primary" data-skip>Pular</button></div>
      <button class="btn ghost block mt" data-close>Minimizar</button></div>`, {
      onMount(root) { ui = { b: root.querySelector('.tt b'), fg: root.querySelector('.fg'), ring: root.querySelector('.rest-ring'), small: root.querySelector('.tt small') }; },
    });
    rest.sheet.el.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d) {
        haptic();
        rest.cd.add(+b.dataset.d);
        if (!rest) return; // −15 s pode encerrar o descanso
        ui.small.textContent = 'de ' + mmss(rest.cd.duration);
        const endAt = rest.cd.endAt, duration = rest.cd.duration;
        update(st => { if (st.rest) { st.rest.endAt = endAt; st.rest.duration = duration; } });
      }
      if (b.dataset.skip != null) { haptic(); stopRest(); clearRestState(); }
    };
    rest.sheet.onClose = () => { ui = {}; if (rest) { rest.sheet = null; showMini(); } };
    rest.cd.loop();
  };
  const showMini = () => {
    const m = document.createElement('div');
    m.className = 'rest-mini';
    m.innerHTML = `<span class="eyebrow" style="font-size:11px">Descanso</span><b class="num flex">${mmss(rest.cd.remaining())}</b><button class="btn sm" data-x>Pular</button><button class="btn sm primary" data-o>Abrir</button>`;
    m.onclick = e => {
      if (e.target.closest('[data-x]')) { stopRest(); clearRestState(); return; }
      openSheet();
    };
    document.body.appendChild(m);
    rest.mini = m;
  };
  open ? openSheet() : showMini();
}

// ---------- Finalizar ----------
function finishSheet(done, total) {
  return new Promise(res => {
    const sh = sheet(`<h3>Finalizar treino?</h3>
      <p class="muted">${done < total ? `Você concluiu ${done} de ${total} exercícios. Séries não marcadas não entram no histórico.` : 'Tudo feito! 💪'}</p>
      <button class="btn primary block xl" data-r="save">Finalizar e salvar</button>
      <div class="row gap mt"><button class="btn ghost flex" data-r="">Continuar</button><button class="btn danger flex" data-r="discard">Descartar</button></div>`);
    sh.onClose = () => res('');
    sh.el.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; sh.onClose = null; sh.close(); res(b.dataset.r); });
  });
}

async function discard() {
  stopRest(); await kv.del('active'); keepAwake(false);
  await nav.pop(nav.stack.length - 1);
  toast('Treino descartado');
}

export async function finishFlow() {
  const s = await getActive();
  if (!s) return;
  const { total, done } = counts(s);
  const anyDone = Object.values(s.entries).some(e => e.sets.some(x => x.done));
  if (!anyDone) {
    if (await confirmSheet('Nenhuma série feita', 'Descartar este treino?', 'Descartar', true)) await discard();
    return;
  }
  const choice = await finishSheet(done, total);
  if (choice === 'discard') {
    if (await confirmSheet('Descartar treino?', 'Nada deste treino será salvo.', 'Descartar', true)) await discard();
    return;
  }
  if (choice !== 'save') return;
  if (s.date < P.start && !await confirmSheet('Treino antes do início', `O programa começa em ${fmtDate(P.start)}. Este treino entra no histórico de cargas, mas não conta na sequência nem nas conquistas. Salvar?`, 'Salvar')) {
    await discard(); return;
  }
  stopRest();
  const prevSessions = await completedSessions();
  // se esqueceu o treino aberto, a duração vai até pouco depois da última série
  const lastAt = lastSetAt(s);
  s.endedAt = Date.now() - lastAt > 30 * 60000 ? lastAt + 3 * 60000 : Date.now();
  s.rest = null;
  if (s.date < P.start) s.test = true;
  // só séries feitas entram no histórico
  let volume = 0, sets = 0;
  for (const [exId, en] of Object.entries(s.entries)) {
    if (!P.ex[exId]) continue;
    for (const x of en.sets) if (x.done) { volume += (x.kg || 0) * x.reps; sets++; }
  }
  s.volume = volume; s.setsDone = sets;
  // recordes
  s.prs = [];
  for (const [exId, en] of Object.entries(s.entries)) {
    const ex = P.ex[exId]; if (!ex || ex.unit === 's') continue;
    const k = histKey(exId, en.variant);
    const prior = historyFor(prevSessions, k);
    const doneSets = en.sets.filter(x => x.done && x.reps > 0);
    if (!prior.length || !doneSets.length) continue;
    const rec = recordsFor(prior);
    const st = sessionStats({ sets: doneSets });
    const def = variantDef(ex, en.variant);
    if (st.maxKg > (rec.bestKg?.kg || 0)) s.prs.push({ exId, name: def.name, kind: 'Carga', value: `${fmtKg(st.maxKg)} kg` });
    else if (st.e1 > (rec.bestE?.e || 0) + 0.01) s.prs.push({ exId, name: def.name, kind: '1RM est.', value: `${fmtKg(Math.round(st.e1 * 10) / 10)} kg` });
  }
  await db.put('sessions', s);
  await kv.del('active');
  s.newAch = (await newAchievements()).map(a => a.id);
  if (s.newAch.length) await db.put('sessions', s);
  await nav.pop(nav.stack.length - 1);
  nav.push((el) => renderSummary(el, s.id), { fullscreen: true, kind: 'summary' });
}

const celebrated = new Set();
const FEELS = [['😫', 'Péssimo'], ['😕', 'Fraco'], ['😐', 'Ok'], ['🙂', 'Bom'], ['🔥', 'Voando']];

export async function renderSummary(el, id) {
  const s = await db.get('sessions', id);
  const w = P.workouts[s.workout];
  const all = await completedSessions();
  const prev = all.filter(x => x.workout === s.workout && x.startedAt < s.startedAt).pop();
  const prof = await kv.get('profile', {});
  const first = (prof.name || 'Pedro').split(' ')[0];
  const ach = (await achievements()).filter(a => (s.newAch || []).includes(a.id));
  const dur = s.endedAt - s.startedAt;
  const delta = (a, b, unit, d = 0) => {
    if (b == null) return '';
    const x = a - b; if (Math.abs(x) < 0.5) return `<small class="dim">= anterior</small>`;
    return `<small class="${x > 0 ? 'delta-up' : 'delta-down'}">${x > 0 ? '▲' : '▼'} ${fmtNum(Math.abs(x), d)}${unit} vs anterior</small>`;
  };
  el.innerHTML = `
    ${header('Resumo', { back: false, right: `<button class="icon-btn" data-share aria-label="Compartilhar">${ICON.share}</button>` })}
    <div class="center">
      <div class="trophy"><svg viewBox="0 0 24 24"><path class="ck" d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <div class="eyebrow">Treino concluído${s.test ? ' · antes do programa' : ''}</div>
      <h1>Mandou bem, ${esc(first)}!</h1>
      <p class="muted">${w.name} · ${w.focus} · Semana ${s.week} · ${P.phases.find(p => p.id === s.phase).name}</p>
    </div>
    <div class="grid2 mt">
      <div class="stat"><div class="lbl">Duração</div><div class="val num">${hhmmss(dur)}</div>${prev ? delta(dur / 60000, (prev.endedAt - prev.startedAt) / 60000, ' min') : ''}</div>
      <div class="stat"><div class="lbl">Volume total</div><div class="val num"><span data-count="${s.volume}">${fmtNum(s.volume)}</span><span class="unit">kg</span></div>${prev ? delta(s.volume, prev.volume, ' kg') : '<small class="dim">primeira vez</small>'}</div>
      <div class="stat"><div class="lbl">Séries feitas</div><div class="val num">${s.setsDone}</div>${prev ? delta(s.setsDone, prev.setsDone, '') : ''}</div>
      <div class="stat"><div class="lbl">Caminhada</div><div class="val num">${s.commute}<span class="unit">min</span></div><small class="dim">ida + volta</small></div>
    </div>
    <div class="card mt">
      <div class="card-title">Como foi o treino?</div>
      <div class="feel-row">${FEELS.map(([e, l], i) => `<button class="feel ${s.feel === i + 1 ? 'on' : ''}" data-feel="${i + 1}" aria-label="${l}"><span>${e}</span><small>${l}</small></button>`).join('')}</div>
    </div>
    <div class="card mt">
      <div class="card-title">Recordes batidos</div>
      ${s.prs.length ? s.prs.map(p => `<div class="row between" style="padding:6px 0"><span>🏆 ${esc(p.name)}</span><span class="tag acc">${p.kind}: ${p.value}</span></div>`).join('')
        : `<p class="muted" style="margin:0">${prev ? 'Nenhum recorde hoje — consistência é o que importa.' : 'Primeira sessão registrada: os recordes começam na próxima!'}</p>`}
    </div>
    ${ach.length ? `<div class="card mt hero"><div class="card-title">Conquista desbloqueada</div>${ach.map(a => `<div class="row gap" style="padding:6px 0"><span class="ach-ico">${a.icon}</span><div><b>${esc(a.title)}</b><br><small>${esc(a.desc)}</small></div></div>`).join('')}</div>` : ''}
    ${prof.why ? `<div class="quote mt">“${esc(prof.why)}”</div>` : ''}
    <div class="dock">
      <button class="btn xl" data-skip>Pular cardio</button>
      <button class="btn primary xl flex" data-cardio>Ir para o cardio ${ICON.chev}</button>
    </div>`;
  if (!celebrated.has(id)) {
    celebrated.add(id);
    setTimeout(confetti, 250);
    beep({ freq: 1046, dur: 0.12, count: 2, gap: 0.05 });
    haptic('heavy');
    speak(`Treino concluído. Mandou bem, ${first}!`);
  }
  el.onclick = async e => {
    const f = e.target.closest('[data-feel]');
    if (f) {
      haptic();
      const cur = await db.get('sessions', id); cur.feel = +f.dataset.feel; await db.put('sessions', cur);
      $$('[data-feel]', el).forEach(b => b.classList.toggle('on', b === f));
      return;
    }
    if (e.target.closest('[data-share]')) return shareSessionCard(await db.get('sessions', id), prof.name || 'Pedro Felipe');
    if (e.target.closest('[data-cardio]')) { await nav.pop(); openCardio(s.id); }
    if (e.target.closest('[data-skip]')) { keepAwake(false); nav.pop(); }
  };
}
