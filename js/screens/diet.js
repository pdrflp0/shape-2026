// Dieta: Mifflin-St Jeor, meta = gasto − 450 kcal, proteína ~2 g/kg, água, checklist e favoritos.
import { db, kv, uid } from '../db.js';
import { dateKey } from '../program.js';
import { nav, header, sheet, toast, esc, ICON, fmtNum, promptSheet, confirmSheet } from '../ui.js';
import { ring } from '../charts.js';
import { getDay, saveDay } from '../day.js';

export const ACTIVITY = [
  { v: 1.2, label: 'Sedentário (pouco ou nenhum exercício)' },
  { v: 1.375, label: 'Leve (1–3x/semana)' },
  { v: 1.55, label: 'Moderado (3–5x/semana)' },
  { v: 1.725, label: 'Alto (6–7x/semana)' },
  { v: 1.9, label: 'Muito alto (atleta/trabalho físico)' },
];

export async function getProfile() {
  return Object.assign({ name: '', sex: 'm', height: '', age: '', weight: 83, activity: 1.55 }, await kv.get('profile', {}));
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
  const kg = w.kg;
  let bmr = null, tdee = null, kcal = null;
  if (p.height && p.age) {
    bmr = 10 * kg + 6.25 * +p.height - 5 * +p.age + (p.sex === 'f' ? -161 : 5);
    tdee = bmr * +p.activity;
    kcal = Math.round((tdee - 450) / 10) * 10;
  }
  const s = await kv.get('settings', {});
  return { kg, weightSource: w.source, bmr, tdee, kcal, protein: Math.round(kg * 2), water: s.waterGoal || Math.round(kg * 0.035 * 4) / 4 };
}

const QUICK = [
  { label: '+25 g frango', protein: 25, kcal: 140 },
  { label: '+20 g whey', protein: 20, kcal: 110 },
  { label: '+6 g ovo', protein: 6, kcal: 75 },
  { label: '+10 g proteína', protein: 10, kcal: 0 },
];
const CHECKS = [
  { id: 'protein', label: 'Proteína batida' },
  { id: 'water', label: 'Água' },
  { id: 'sleep', label: '8 h de sono' },
  { id: 'steps', label: 'Passos' },
];

export async function renderDiet(el) {
  const t = await nutritionTargets();
  const d = await getDay();
  const favs = await kv.get('favMeals', [
    { id: 'f1', name: 'Frango + arroz + salada', kcal: 550, protein: 45 },
    { id: 'f2', name: 'Shake whey + banana', kcal: 230, protein: 25 },
    { id: 'f3', name: 'Omelete 3 ovos', kcal: 240, protein: 19 },
  ]);
  const pPct = d.protein / t.protein, wPct = d.water / 1000 / t.water;
  const kPct = t.kcal ? d.kcal / t.kcal : 0;

  el.innerHTML = `
    <div class="top-hello"><div class="eyebrow">Dieta</div><h1>Hoje</h1></div>
    <div class="stack mt">
      <div class="card hero">
        <div class="card-title">Proteína · meta ~2 g/kg</div>
        <div class="protein-hero">
          ${ring(pPct, { size: 112, stroke: 11, label: Math.round(pPct * 100) + '%' })}
          <div class="flex">
            <div class="big num"><span data-count="${d.protein}">${d.protein}</span><span class="unit">/ ${t.protein} g</span></div>
            <small>${d.protein >= t.protein ? '✓ Meta batida!' : `Faltam ${t.protein - d.protein} g`} · base ${fmtNum(t.kg, 1)} kg (${t.weightSource})</small>
          </div>
        </div>
        <div class="quick mt">${QUICK.map((q, i) => `<button class="chip" data-q="${i}">${q.label}</button>`).join('')}</div>
        <button class="btn block mt" data-free>${ICON.plus} Lançar kcal / proteína</button>
      </div>

      <div class="card">
        <div class="card-title">Calorias <span class="num">${fmtNum(d.kcal)} / ${t.kcal ? fmtNum(t.kcal) : '—'} kcal</span></div>
        ${t.kcal ? `<div class="pbar org"><i style="width:${Math.min(100, kPct * 100)}%"></i></div>
          <small class="mt" style="display:block;margin-top:8px">Gasto estimado ${fmtNum(t.tdee)} kcal (TMB ${fmtNum(t.bmr)} × ${(await getProfile()).activity}) − 450 kcal = <b>${fmtNum(t.kcal)}</b></small>`
          : `<p class="muted" style="margin:0">Preencha altura e idade no <b>Perfil</b> para calcular sua meta.</p><button class="btn sm mt" data-goprofile>Abrir perfil</button>`}
      </div>

      <div class="card">
        <div class="card-title">Água <span class="num">${fmtNum(d.water / 1000, 2)} / ${fmtNum(t.water, 2)} L</span></div>
        <div class="pbar blue"><i style="width:${Math.min(100, wPct * 100)}%"></i></div>
        <div class="row gap mt"><button class="chip flex" data-w="250">${ICON.drop} +250 ml</button><button class="chip flex" data-w="500">${ICON.drop} +500 ml</button><button class="chip" data-w="-250" aria-label="remover 250 ml">−</button></div>
      </div>

      <div class="card">
        <div class="card-title">Checklist do dia</div>
        <div class="list checklist">${CHECKS.map(c => `<div class="li ${d.checks[c.id] ? 'on' : ''}" data-check="${c.id}"><div class="cbox">${ICON.check}</div><div class="li-main"><b>${c.label}</b></div></div>`).join('')}</div>
      </div>

      <div class="card">
        <div class="card-title">Refeições favoritas <button class="btn sm ghost" data-addfav>${ICON.plus}</button></div>
        <div class="list">${favs.map(f => `<div class="li"><div class="li-main tap" data-fav="${f.id}"><b>${esc(f.name)}</b><small>${f.kcal} kcal · ${f.protein} g proteína</small></div>
          <button class="btn sm primary" data-fav="${f.id}">+ Lançar</button><button class="icon-btn" data-delfav="${f.id}" aria-label="Remover" style="width:40px;height:40px">${ICON.trash}</button></div>`).join('') || '<div class="li muted">Nenhuma ainda</div>'}</div>
      </div>

      ${d.log.length ? `<div class="card"><div class="card-title">Lançamentos de hoje</div><div class="list">${d.log.slice().reverse().map(x => `<div class="li"><div class="li-main"><b>${esc(x.label)}</b><small>${new Date(x.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${x.kcal} kcal · ${x.protein} g</small></div><button class="icon-btn" data-undo="${x.t}" style="width:40px;height:40px" aria-label="Desfazer">${ICON.trash}</button></div>`).join('')}</div></div>` : ''}
    </div>`;

  const add = async (label, protein, kcal) => {
    const day = await getDay();
    day.protein += protein; day.kcal += kcal;
    day.log.push({ t: Date.now(), label, protein, kcal });
    if (day.protein >= t.protein) day.checks.protein = true;
    await saveDay(day);
    toast(`${label} ✓`, 'ok');
    nav.refresh();
  };

  el.onclick = async e => {
    const b = e.target.closest('[data-q],[data-free],[data-w],[data-check],[data-fav],[data-addfav],[data-delfav],[data-undo],[data-goprofile]');
    if (!b) return;
    if (b.dataset.q) { const q = QUICK[b.dataset.q]; return add(q.label.replace('+', ''), q.protein, q.kcal); }
    if (b.dataset.free != null) return freeEntry(add);
    if (b.dataset.w) {
      const day = await getDay(); day.water = Math.max(0, day.water + +b.dataset.w);
      if (day.water / 1000 >= t.water) day.checks.water = true;
      await saveDay(day); return nav.refresh();
    }
    if (b.dataset.check) { const day = await getDay(); day.checks[b.dataset.check] = !day.checks[b.dataset.check]; await saveDay(day); return nav.refresh(); }
    if (b.dataset.fav) { const f = favs.find(x => x.id === b.dataset.fav); return add(f.name, f.protein, f.kcal); }
    if (b.dataset.addfav != null) return editFav(favs);
    if (b.dataset.delfav) {
      if (!await confirmSheet('Remover favorita?', esc(favs.find(x => x.id === b.dataset.delfav).name), 'Remover', true)) return;
      await kv.set('favMeals', favs.filter(x => x.id !== b.dataset.delfav)); return nav.refresh();
    }
    if (b.dataset.undo) {
      const day = await getDay(); const i = day.log.findIndex(x => x.t === +b.dataset.undo);
      if (i >= 0) { const x = day.log.splice(i, 1)[0]; day.protein = Math.max(0, day.protein - x.protein); day.kcal = Math.max(0, day.kcal - x.kcal); await saveDay(day); }
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
    <div class="row gap mt2"><button class="btn ghost flex" data-close>Cancelar</button><button class="btn primary flex" data-ok>Lançar</button></div>`);
  sh.el.querySelector('[data-ok]').onclick = () => {
    const k = parseInt(sh.el.querySelector('[data-k]').value) || 0, p = parseInt(sh.el.querySelector('[data-p]').value) || 0;
    sh.close(); if (k || p) add(sh.el.querySelector('[data-n]').value.trim() || 'Lançamento livre', p, k);
  };
}

function editFav(favs) {
  const sh = sheet(`<h3>Nova refeição favorita</h3>
    <label class="lbl">Nome</label><input class="field" data-n placeholder="ex.: Iogurte + granola">
    <div class="form-grid"><div><label class="lbl">Kcal</label><input class="field" data-k inputmode="numeric"></div>
    <div><label class="lbl">Proteína (g)</label><input class="field" data-p inputmode="numeric"></div></div>
    <div class="row gap mt2"><button class="btn ghost flex" data-close>Cancelar</button><button class="btn primary flex" data-ok>Salvar</button></div>`);
  sh.el.querySelector('[data-ok]').onclick = async () => {
    const name = sh.el.querySelector('[data-n]').value.trim(); if (!name) return toast('Dê um nome');
    favs.push({ id: uid(), name, kcal: parseInt(sh.el.querySelector('[data-k]').value) || 0, protein: parseInt(sh.el.querySelector('[data-p]').value) || 0 });
    await kv.set('favMeals', favs); sh.close(); nav.refresh();
  };
}
