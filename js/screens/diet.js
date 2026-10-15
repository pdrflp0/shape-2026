// Dieta: Mifflin-St Jeor, meta = gasto − déficit (450 kcal), proteína ~2 g/kg, água, checklist e favoritos.
import { db, kv, uid } from '../db.js';
import { dateKey, parseKey, addDays, fmtDate } from '../program.js';
import { nav, sheet, toast, esc, ICON, fmtNum, confirmSheet, haptic } from '../ui.js';
import { ring, barChart } from '../charts.js';
import { getDay, saveDay } from '../day.js';

export const ACTIVITY = [
  { v: 1.2, label: 'Sedentário (pouco ou nenhum exercício)' },
  { v: 1.375, label: 'Leve (1–3x/semana)' },
  { v: 1.55, label: 'Moderado (3–5x/semana)' },
  { v: 1.725, label: 'Alto (6–7x/semana)' },
  { v: 1.9, label: 'Muito alto (atleta/trabalho físico)' },
];

export async function getProfile() {
  return Object.assign({ name: 'Pedro Felipe', sex: 'm', height: '', age: '', weight: 83, activity: 1.55, why: '' }, await kv.get('profile', {}));
}

// Peso atual = média dos últimos 7 dias (se houver), senão último registro, senão o do perfil
export async function currentWeight() {
  const ws = (await db.all('weights')).sort((a, b) => a.id < b.id ? -1 : 1);
  const prof = await getProfile();
  if (!ws.length) return { kg: +prof.weight || 83, source: 'perfil', last: null, avg7: null };
  const last = ws[ws.length - 1];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6);
  const recent = ws.filter(w => w.id >= dateKey(cutoff));
  const avg7 = recent.length ? recent.reduce((s, w) => s + w.kg, 0) / recent.length : null;
  return { kg: avg7 || last.kg, source: avg7 ? 'média 7 dias' : 'último registro', last, avg7 };
}

export async function nutritionTargets() {
  const p = await getProfile();
  const w = await currentWeight();
  const s = await kv.get('settings', {});
  const deficit = s.deficit ?? 450, perKg = s.proteinPerKg || 2;
  const kg = w.kg;
  let bmr = null, tdee = null, kcal = null;
  if (p.height && p.age) {
    bmr = 10 * kg + 6.25 * +p.height - 5 * +p.age + (p.sex === 'f' ? -161 : 5);
    tdee = bmr * +p.activity;
    kcal = Math.round((tdee - deficit) / 10) * 10;
  }
  return { kg, weightSource: w.source, bmr, tdee, kcal, deficit, perKg, protein: Math.round(kg * perKg), water: s.waterGoal || Math.round(kg * 0.035 * 4) / 4 };
}

export const DEFAULT_QUICK = [
  { label: 'frango', protein: 25, kcal: 140 },
  { label: 'whey', protein: 20, kcal: 110 },
  { label: 'ovo', protein: 6, kcal: 75 },
  { label: 'proteína', protein: 10, kcal: 0 },
];
const CHECKS = [
  { id: 'protein', label: 'Proteína batida', auto: true },
  { id: 'water', label: 'Água', auto: true },
  { id: 'sleep', label: '8 h de sono' },
  { id: 'steps', label: 'Passos', auto: true },
];

let viewKey = null; // dia sendo visto (permite lançar no dia anterior)

// Metas batidas marcam o checklist sozinhas (e desmarcam se você desfizer um lançamento)
function autoChecks(day, t) {
  day.checks.protein = day.protein >= t.protein;
  day.checks.water = day.water / 1000 >= t.water;
  if (day.steps) day.checks.steps = day.steps >= 8000;
}

export async function renderDiet(el) {
  const today = dateKey();
  if (!viewKey || viewKey > today) viewKey = today;
  const isToday = viewKey === today;
  const t = await nutritionTargets();
  const d = await getDay(viewKey);
  const prof = await getProfile();
  const quick = await kv.get('quickProtein', DEFAULT_QUICK);
  const favs = await kv.get('favMeals', [
    { id: 'f1', name: 'Frango + arroz + salada', kcal: 550, protein: 45 },
    { id: 'f2', name: 'Shake whey + banana', kcal: 230, protein: 25 },
    { id: 'f3', name: 'Omelete 3 ovos', kcal: 240, protein: 19 },
  ]);
  const pPct = d.protein / t.protein, wPct = d.water / 1000 / t.water;
  const kPct = t.kcal ? d.kcal / t.kcal : 0;
  // últimos 7 dias de proteína
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const k = dateKey(addDays(parseKey(today), -i));
    const dd = await db.get('days', k);
    week.push({ k, y: dd ? dd.protein : 0, label: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][parseKey(k).getDay()] });
  }
  const hit = week.filter(x => x.y >= t.protein).length;
  // média só dos dias em que houve lançamento (dia sem registro não é dia com 0 g)
  const logged = week.filter(x => x.y > 0);
  const avgP = logged.length ? Math.round(logged.reduce((s, x) => s + x.y, 0) / logged.length) : 0;

  el.innerHTML = `
    <div class="top-hello"><div class="eyebrow">Dieta</div>
      <div class="row between"><h1>${isToday ? 'Hoje' : fmtDate(viewKey, true)}</h1>
        <div class="row gap"><button class="icon-btn" data-day="-1" aria-label="Dia anterior">${ICON.back}</button>
        <button class="icon-btn" data-day="1" aria-label="Próximo dia" ${isToday ? 'disabled style="opacity:.3"' : ''}>${ICON.chev}</button></div></div>
      ${isToday ? '' : '<p class="hello-line">Lançando em um dia anterior.</p>'}
    </div>
    <div class="stack mt">
      <div class="card hero">
        <div class="card-title">Proteína · meta ~${fmtNum(t.perKg, 1)} g/kg</div>
        <div class="protein-hero">
          ${ring(pPct, { size: 112, stroke: 11, label: Math.round(pPct * 100) + '%' })}
          <div class="flex">
            <div class="big num"><span data-count="${d.protein}">${d.protein}</span><span class="unit">/ ${t.protein} g</span></div>
            <small>${d.protein >= t.protein ? '✓ Meta batida!' : `Faltam ${t.protein - d.protein} g`} · base ${fmtNum(t.kg, 1)} kg (${t.weightSource})</small>
          </div>
        </div>
        <div class="quick mt">${quick.map((q, i) => `<button class="chip" data-q="${i}">+${q.protein} g ${esc(q.label)}</button>`).join('')}</div>
        <div class="row gap mt"><button class="btn flex" data-free>${ICON.plus} Lançar kcal / proteína</button><button class="icon-btn" data-editquick aria-label="Editar botões rápidos" style="width:52px;height:52px">${ICON.edit}</button></div>
      </div>

      <div class="card">
        <div class="card-title">Últimos 7 dias <span class="num">${hit}/7 metas${avgP ? ` · média ${avgP} g` : ''}</span></div>
        ${barChart(week.map(x => ({ y: x.y, label: x.label })), { goal: t.protein, empty: 'Sem lançamentos ainda' })}
        <div class="legend"><span><i style="background:var(--accent)"></i>bateu a meta</span><span><i style="background:var(--accent);opacity:.35"></i>abaixo</span><span><i style="background:transparent;border-top:2px dashed var(--accent-2);border-radius:0;height:0"></i>meta ${t.protein} g</span></div>
      </div>

      <div class="card">
        <div class="card-title">Calorias <span class="num">${fmtNum(d.kcal)} / ${t.kcal ? fmtNum(t.kcal) : '—'} kcal</span></div>
        ${t.kcal ? `<div class="pbar org"><i style="width:${Math.min(100, kPct * 100)}%"></i></div>
          <div class="row between mt"><b class="num ${d.kcal > t.kcal ? 'delta-down' : ''}">${d.kcal > t.kcal ? `${fmtNum(d.kcal - t.kcal)} kcal acima` : `Restam ${fmtNum(t.kcal - d.kcal)} kcal`}</b></div>
          <small style="display:block;margin-top:6px">Gasto ${fmtNum(t.tdee)} kcal (TMB ${fmtNum(t.bmr)} × ${prof.activity}) − ${t.deficit} kcal = <b>${fmtNum(t.kcal)}</b>. Recalcula quando a média de peso muda.</small>`
          : `<p class="muted" style="margin:0">Preencha altura e idade no <b>Perfil</b> para calcular sua meta.</p><button class="btn sm mt" data-goprofile>Abrir perfil</button>`}
      </div>

      <div class="card">
        <div class="card-title">Água <span class="num">${fmtNum(d.water / 1000, 2)} / ${fmtNum(t.water, 2)} L</span></div>
        <div class="pbar blue"><i style="width:${Math.min(100, wPct * 100)}%"></i></div>
        <div class="row gap mt"><button class="chip flex" data-w="250">${ICON.drop} +250 ml</button><button class="chip flex" data-w="500">${ICON.drop} +500 ml</button><button class="chip" data-w="-250" aria-label="remover 250 ml">−</button></div>
      </div>

      <div class="card">
        <div class="card-title">Checklist do dia</div>
        <div class="list checklist">${CHECKS.map(c => `<div class="li ${d.checks[c.id] ? 'on' : ''}" data-check="${c.id}"><div class="cbox">${ICON.check}</div><div class="li-main"><b>${c.label}</b>${c.auto ? '<small>marca sozinho quando bate a meta</small>' : ''}</div></div>`).join('')}</div>
      </div>

      <div class="card">
        <div class="card-title">Refeições favoritas <button class="btn sm ghost" data-addfav>${ICON.plus}</button></div>
        <div class="list">${favs.map(f => `<div class="li"><div class="li-main tap" data-editfav="${f.id}"><b>${esc(f.name)}</b><small>${f.kcal} kcal · ${f.protein} g proteína · toque para editar</small></div>
          <button class="btn sm primary" data-fav="${f.id}">+ Lançar</button></div>`).join('') || '<div class="li muted">Nenhuma ainda</div>'}</div>
      </div>

      ${d.log.length ? `<div class="card"><div class="card-title">Lançamentos ${isToday ? 'de hoje' : 'do dia'}</div><div class="list">${d.log.slice().reverse().map(x => `<div class="li"><div class="li-main"><b>${esc(x.label)}</b><small>${new Date(x.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${x.kcal} kcal · ${x.protein} g</small></div><button class="icon-btn" data-undo="${x.t}" style="width:40px;height:40px" aria-label="Desfazer">${ICON.trash}</button></div>`).join('')}</div></div>` : ''}
    </div>`;

  const add = async (label, protein, kcal) => {
    const day = await getDay(viewKey);
    day.protein += protein; day.kcal += kcal;
    day.log.push({ t: Date.now(), label, protein, kcal });
    autoChecks(day, t);
    await saveDay(day);
    haptic();
    toast(`${label} ✓`, 'ok');
    nav.refresh();
  };

  el.onclick = async e => {
    const b = e.target.closest('[data-day],[data-q],[data-free],[data-editquick],[data-w],[data-check],[data-fav],[data-editfav],[data-addfav],[data-undo],[data-goprofile]');
    if (!b || b.disabled) return;
    if (b.dataset.day) { viewKey = dateKey(addDays(parseKey(viewKey), +b.dataset.day)); return nav.refresh(undefined, { animate: true }); }
    if (b.dataset.q) { const q = quick[b.dataset.q]; return add(`${q.protein} g ${q.label}`, q.protein, q.kcal); }
    if (b.dataset.free != null) return freeEntry(add);
    if (b.dataset.editquick != null) return editQuick(quick);
    if (b.dataset.w) {
      const day = await getDay(viewKey); day.water = Math.max(0, day.water + +b.dataset.w);
      autoChecks(day, t);
      await saveDay(day); haptic(); return nav.refresh();
    }
    if (b.dataset.check) { const day = await getDay(viewKey); day.checks[b.dataset.check] = !day.checks[b.dataset.check]; await saveDay(day); haptic(); return nav.refresh(); }
    if (b.dataset.fav) { const f = favs.find(x => x.id === b.dataset.fav); return add(f.name, f.protein, f.kcal); }
    if (b.dataset.addfav != null) return editFav(favs);
    if (b.dataset.editfav) return editFav(favs, favs.find(x => x.id === b.dataset.editfav));
    if (b.dataset.undo) {
      const day = await getDay(viewKey); const i = day.log.findIndex(x => x.t === +b.dataset.undo);
      if (i >= 0) { const x = day.log.splice(i, 1)[0]; day.protein = Math.max(0, day.protein - x.protein); day.kcal = Math.max(0, day.kcal - x.kcal); autoChecks(day, t); await saveDay(day); }
      return nav.refresh();
    }
    if (b.dataset.goprofile != null) document.querySelector('.tab[data-tab="profile"]').click();
  };
}

function freeEntry(add) {
  const sh = sheet(`<h3>Lançar refeição</h3>
    <label class="lbl">Descrição (opcional)</label><input class="field" data-n placeholder="ex.: almoço">
    <div class="form-grid"><div><label class="lbl">Kcal</label><input class="field" data-k inputmode="numeric" placeholder="0"></div>
    <div><label class="lbl">Proteína (g)</label><input class="field" data-p inputmode="numeric" placeholder="0"></div></div>
    <label class="row gap mt" style="font-size:14px"><input type="checkbox" data-save style="width:22px;height:22px;accent-color:var(--accent)"> Salvar também como favorita</label>
    <div class="row gap mt2"><button class="btn ghost flex" data-close>Cancelar</button><button class="btn primary flex" data-ok>Lançar</button></div>`);
  sh.el.querySelector('[data-ok]').onclick = async () => {
    const k = parseInt(sh.el.querySelector('[data-k]').value) || 0, p = parseInt(sh.el.querySelector('[data-p]').value) || 0;
    const name = sh.el.querySelector('[data-n]').value.trim();
    if (sh.el.querySelector('[data-save]').checked && name) {
      const favs = await kv.get('favMeals', []); favs.push({ id: uid(), name, kcal: k, protein: p }); await kv.set('favMeals', favs);
    }
    sh.close(); if (k || p) add(name || 'Lançamento livre', p, k);
  };
}

function editFav(favs, cur = null) {
  const sh = sheet(`<h3>${cur ? 'Editar' : 'Nova'} refeição favorita</h3>
    <label class="lbl">Nome</label><input class="field" data-n placeholder="ex.: Iogurte + granola" value="${esc(cur ? cur.name : '')}">
    <div class="form-grid"><div><label class="lbl">Kcal</label><input class="field" data-k inputmode="numeric" value="${cur ? cur.kcal : ''}"></div>
    <div><label class="lbl">Proteína (g)</label><input class="field" data-p inputmode="numeric" value="${cur ? cur.protein : ''}"></div></div>
    <div class="row gap mt2">${cur ? '<button class="btn danger" data-del>Remover</button>' : ''}<button class="btn ghost flex" data-close>Cancelar</button><button class="btn primary flex" data-ok>Salvar</button></div>`);
  sh.el.querySelector('[data-ok]').onclick = async () => {
    const name = sh.el.querySelector('[data-n]').value.trim(); if (!name) return toast('Dê um nome');
    const rec = { id: cur ? cur.id : uid(), name, kcal: parseInt(sh.el.querySelector('[data-k]').value) || 0, protein: parseInt(sh.el.querySelector('[data-p]').value) || 0 };
    const list = cur ? favs.map(f => f.id === cur.id ? rec : f) : [...favs, rec];
    await kv.set('favMeals', list); sh.close(); nav.refresh();
  };
  const del = sh.el.querySelector('[data-del]');
  if (del) del.onclick = async () => {
    sh.close();
    if (await confirmSheet('Remover favorita?', esc(cur.name), 'Remover', true)) { await kv.set('favMeals', favs.filter(x => x.id !== cur.id)); nav.refresh(); }
  };
}

function editQuick(quick) {
  const rows = [...quick, ...Array(Math.max(0, 6 - quick.length)).fill({ label: '', protein: '', kcal: '' })].slice(0, 6);
  const sh = sheet(`<h3>Botões rápidos de proteína</h3><p class="muted">Até 6 botões. Deixe o nome vazio para remover.</p>
    ${rows.map((q, i) => `<div class="quick-edit" data-row="${i}"><input class="field" data-l placeholder="nome (ex.: atum)" value="${esc(q.label)}"><input class="field" data-p inputmode="numeric" placeholder="g" value="${q.protein}"><input class="field" data-k inputmode="numeric" placeholder="kcal" value="${q.kcal}"></div>`).join('')}
    <div class="row gap mt2"><button class="btn ghost flex" data-reset>Padrão</button><button class="btn primary flex" data-ok>Salvar</button></div>`);
  sh.el.querySelector('[data-ok]').onclick = async () => {
    const out = [...sh.el.querySelectorAll('[data-row]')].map(r => ({ label: r.querySelector('[data-l]').value.trim(), protein: parseInt(r.querySelector('[data-p]').value) || 0, kcal: parseInt(r.querySelector('[data-k]').value) || 0 })).filter(q => q.label && q.protein);
    await kv.set('quickProtein', out.length ? out : DEFAULT_QUICK); sh.close(); nav.refresh();
  };
  sh.el.querySelector('[data-reset]').onclick = async () => { await kv.del('quickProtein'); sh.close(); nav.refresh(); };
}
