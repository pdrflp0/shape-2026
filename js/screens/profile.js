// Perfil e configurações: você, conquistas, metas, aparência, treino, cargas do prime, backup.
import { db, kv, exportBackup, importBackup, requestPersist, STORES } from '../db.js';
import { P, applyPersonal, programSessions, weekLabel } from '../program.js';
import { DEFAULT_PLATES, fmtKg } from '../progression.js';
import { nav, header, toast, esc, ICON, confirmSheet, sheet, haptic, setHaptics, applyTheme, THEMES, $$ } from '../ui.js';
import { ACTIVITY, getProfile, nutritionTargets } from './diet.js';
import { beep, unlockAudio, flash, speak } from '../timer.js';
import { achievements } from '../achievements.js';

const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const ALL_PLATES = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1];

async function getSettingsFull() {
  return Object.assign({
    restCompound: P.rest.compound, restIsolation: P.rest.isolation, sound: true, volume: 0.6, voice: false, haptics: true,
    waterGoal: '', deficit: 450, proteinPerKg: 2, barKg: 20, plates: DEFAULT_PLATES, weighDays: [1, 3, 5], theme: 'lime',
  }, await kv.get('settings', {}));
}
const saveSettings = async patch => kv.set('settings', Object.assign(await kv.get('settings', {}), patch));

export async function renderProfile(el) {
  const p = await getProfile();
  const st = await getSettingsFull();
  const goal = P.goal;
  const t = await nutritionTargets();
  const lastBackup = await kv.get('lastBackup', null);
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ach = await achievements();
  const unlocked = ach.filter(a => a.unlocked).length;
  const nDone = (await programSessions()).length;
  const initials = (p.name || 'Pedro Felipe').split(' ').filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
  const wl = weekLabel();

  el.innerHTML = `
    <div class="profile-head">
      <div class="avatar">${esc(initials)}</div>
      <div class="flex"><h1 style="font-size:26px">${esc(p.name || 'Pedro Felipe')}</h1>
        <small>${wl.title} · ${nDone} treinos · ${unlocked}/${ach.length} conquistas</small></div>
    </div>
    <div class="stack mt">
      <div class="card">
        <div class="card-title">Conquistas <span class="num">${unlocked}/${ach.length}</span></div>
        <div class="ach-grid">${ach.map(a => `<button class="ach ${a.unlocked ? 'on' : ''}" data-ach="${a.id}"><span class="ach-ico">${a.icon}</span><small>${esc(a.title)}</small>${a.unlocked ? '' : `<i style="width:${a.pct * 100}%"></i>`}</button>`).join('')}</div>
      </div>

      <div class="card">
        <div class="card-title">Seu porquê</div>
        <textarea class="field" data-why placeholder="ex.: Chegar em 2027 mais leve, forte e com disposição para tudo.">${esc(p.why || '')}</textarea>
        <small>Aparece na tela Hoje e no fim de cada treino.</small>
      </div>

      <div class="card">
        <div class="card-title">Dados pessoais</div>
        <label class="lbl">Nome</label><input class="field" data-p="name" value="${esc(p.name)}" placeholder="Seu nome">
        <div class="form-grid">
          <div><label class="lbl">Sexo</label><select class="field" data-p="sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Masculino</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Feminino</option></select></div>
          <div><label class="lbl">Idade</label><input class="field" data-p="age" inputmode="numeric" value="${p.age}" placeholder="anos"></div>
          <div><label class="lbl">Altura (cm)</label><input class="field" data-p="height" inputmode="numeric" value="${p.height}" placeholder="178"></div>
          <div><label class="lbl">Peso atual (kg)</label><input class="field" data-p="weight" inputmode="decimal" value="${String(p.weight).replace('.', ',')}"></div>
        </div>
        <label class="lbl">Nível de atividade</label>
        <select class="field" data-p="activity">${ACTIVITY.map(a => `<option value="${a.v}" ${+p.activity === a.v ? 'selected' : ''}>${a.v} · ${a.label}</option>`).join('')}</select>
        <button class="btn primary block mt" data-saveprof>Salvar perfil</button>
        ${t.kcal ? `<div class="info-box mt">Gasto ≈ <b>${Math.round(t.tdee)} kcal</b> · Meta <b>${t.kcal} kcal</b> · Proteína <b>${t.protein} g</b> (peso base ${fmtKg(Math.round(t.kg * 10) / 10)} kg, ${t.weightSource})</div>` : ''}
      </div>

      <div class="card">
        <div class="card-title">Metas</div>
        <div class="form-grid">
          <div><label class="lbl">Peso no início (kg)</label><input class="field" data-g="startWeight" inputmode="decimal" value="${fmtKg(goal.startWeight)}"></div>
          <div><label class="lbl">Déficit (kcal/dia)</label><input class="field" data-s="deficit" inputmode="numeric" value="${st.deficit}"></div>
          <div><label class="lbl">Meta mínima (kg)</label><input class="field" data-g="targetMin" inputmode="decimal" value="${fmtKg(goal.targetMin)}"></div>
          <div><label class="lbl">Meta máxima (kg)</label><input class="field" data-g="targetMax" inputmode="decimal" value="${fmtKg(goal.targetMax)}"></div>
          <div><label class="lbl">Proteína (g por kg)</label><input class="field" data-s="proteinPerKg" inputmode="decimal" value="${fmtKg(st.proteinPerKg)}"></div>
          <div><label class="lbl">Água (L) · vazio = auto</label><input class="field" data-s="waterGoal" inputmode="decimal" value="${st.waterGoal ? fmtKg(st.waterGoal) : ''}" placeholder="${fmtKg(t.water)}"></div>
        </div>
        <label class="lbl">Dias de pesagem (lembrete na tela Hoje)</label>
        <div class="dow-pick">${DOW.map((d, i) => `<button class="chip ${st.weighDays.includes(i) ? 'on' : ''}" data-dow="${i}">${d}</button>`).join('')}</div>
        <button class="btn primary block mt" data-savegoal>Salvar metas</button>
      </div>

      <div class="card">
        <div class="card-title">Cor do app</div>
        <div class="theme-pick">${Object.entries(THEMES).map(([k, th]) => `<button class="sw ${st.theme === k ? 'on' : ''}" data-theme="${k}" style="--c:${th.accent}" aria-label="${th.name}"><i></i><small>${th.name}</small></button>`).join('')}</div>
      </div>

      <div class="card">
        <div class="card-title">Treino</div>
        <div class="form-grid">
          <div><label class="lbl">Descanso compostos ★ (s)</label><input class="field" data-s="restCompound" inputmode="numeric" value="${st.restCompound}"></div>
          <div><label class="lbl">Descanso isolados (s)</label><input class="field" data-s="restIsolation" inputmode="numeric" value="${st.restIsolation}"></div>
        </div>
        <div class="toggle-row"><div><b>Som ao terminar</b><small>Beep curto que abaixa a música por um instante</small></div><button class="switch ${st.sound ? 'on' : ''}" data-toggle="sound" aria-label="Som"></button></div>
        <div class="toggle-row"><div><b>Voz</b><small>“Bora! Supino, série 2, 40 quilos…” ao fim do descanso</small></div><button class="switch ${st.voice ? 'on' : ''}" data-toggle="voice" aria-label="Voz"></button></div>
        <div class="toggle-row"><div><b>Vibração</b><small>Toque leve ao marcar séries (iOS 18+)</small></div><button class="switch ${st.haptics ? 'on' : ''}" data-toggle="haptics" aria-label="Vibração"></button></div>
        <label class="lbl">Volume do beep</label><input type="range" min="0.1" max="1" step="0.1" value="${st.volume}" data-s="volume" style="width:100%;accent-color:var(--accent)">
        <button class="btn block mt" data-test>🔔 Testar beep e voz</button>
        <p class="muted" style="font-size:13px">No iPhone, tire do modo silencioso para ouvir. O flash na tela sempre aparece.</p>
        <label class="lbl">Barra olímpica (kg)</label><input class="field" data-s="barKg" inputmode="decimal" value="${fmtKg(st.barKg)}">
        <label class="lbl">Anilhas da sua academia (para “por lado”)</label>
        <div class="row gap wrap">${ALL_PLATES.map(v => `<button class="chip ${st.plates.includes(v) ? 'on' : ''}" data-plate="${v}">${fmtKg(v)}</button>`).join('')}</div>
        <button class="btn primary block mt" data-saveset>Salvar ajustes de treino</button>
      </div>

      <div class="list">
        <div class="li tap" data-prime><div class="li-main"><b>Cargas do "prime"</b><small>Base para a 1ª sessão (sugere ~55%)</small></div><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>
      </div>

      <div class="card">
        <div class="card-title">Backup</div>
        <p class="muted" style="margin-top:0">O iOS pode apagar dados de apps web sem uso por muito tempo. Exporte um backup toda semana e salve em Arquivos/iCloud.</p>
        <p style="font-size:14px">Último backup: <b>${lastBackup ? new Date(lastBackup).toLocaleString('pt-BR') : 'nunca'}</b><br>Armazenamento persistente: <b>${persisted ? 'sim ✓' : 'não garantido'}</b></p>
        <button class="btn primary block" data-export>Exportar backup (JSON)</button>
        <button class="btn block mt" data-import>Importar backup</button>
      </div>

      ${!standalone ? `<div class="card"><div class="card-title">Instalar no iPhone</div><ol style="margin:0;padding-left:20px"><li>Abra este site no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> (quadrado com seta).</li><li><b>Adicionar à Tela de Início</b> → Adicionar.</li><li>Abra pelo ícone "Shape 2026".</li></ol></div>` : ''}

      <div class="list"><div class="li tap" data-reset><div class="li-main"><b style="color:var(--danger)">Apagar todos os dados</b><small>Faça um backup antes</small></div></div></div>
      <p class="center dim" style="font-size:12px">Shape 2026 · feito para ${esc((p.name || 'Pedro Felipe').split(' ')[0])} · 100% offline · dados só no seu aparelho</p>
    </div>`;

  const sel = { dows: new Set(st.weighDays), plates: new Set(st.plates) };

  el.onchange = async e => {
    if (e.target.dataset.why != null) {
      await kv.set('profile', Object.assign(await kv.get('profile', {}), { why: e.target.value.trim() }));
      toast('Salvo ✓', 'ok');
    }
  };
  el.onclick = async e => {
    const b = e.target.closest('button, [data-prime], [data-reset]'); if (!b) return;
    if (b.dataset.saveprof != null) {
      const np = Object.assign({}, await kv.get('profile', {}));
      $$('[data-p]', el).forEach(i => { np[i.dataset.p] = i.value.trim(); });
      np.weight = parseFloat(String(np.weight).replace(',', '.')) || 83;
      np.activity = parseFloat(np.activity);
      await kv.set('profile', np); haptic(); toast('Perfil salvo ✓', 'ok'); nav.refresh();
    }
    if (b.dataset.ach) {
      const a = ach.find(x => x.id === b.dataset.ach);
      sheet(`<div class="center"><div style="font-size:56px">${a.icon}</div><h3>${esc(a.title)}</h3><p class="muted">${esc(a.desc)}</p>
        <div class="pbar mt"><i style="width:${a.pct * 100}%"></i></div><p class="num">${a.unlocked ? '✓ Desbloqueada' : a.label}</p></div>`);
    }
    if (b.dataset.dow) { const d = +b.dataset.dow; sel.dows.has(d) ? sel.dows.delete(d) : sel.dows.add(d); b.classList.toggle('on'); haptic(); }
    if (b.dataset.plate) { const v = +b.dataset.plate; sel.plates.has(v) ? sel.plates.delete(v) : sel.plates.add(v); b.classList.toggle('on'); haptic(); }
    if (b.dataset.savegoal != null) {
      const g = Object.assign({}, await kv.get('goal', {}));
      $$('[data-g]', el).forEach(i => { const v = parseFloat(i.value.replace(',', '.')); if (v > 30 && v < 300) g[i.dataset.g] = v; });
      if (g.targetMin && g.targetMax && g.targetMin > g.targetMax) [g.targetMin, g.targetMax] = [g.targetMax, g.targetMin];
      await kv.set('goal', g); await applyPersonal();
      const patch = { weighDays: [...sel.dows].sort() };
      $$('.card [data-s]', el).forEach(i => {
        if (!['deficit', 'proteinPerKg', 'waterGoal'].includes(i.dataset.s)) return;
        const v = parseFloat(String(i.value).replace(',', '.'));
        if (i.dataset.s === 'waterGoal') patch.waterGoal = v > 0 ? v : '';
        else if (v >= 0 && !isNaN(v)) patch[i.dataset.s] = v;
      });
      await saveSettings(patch); haptic(); toast('Metas salvas ✓', 'ok'); nav.refresh();
    }
    if (b.dataset.theme) { applyTheme(b.dataset.theme); await saveSettings({ theme: b.dataset.theme }); haptic(); nav.refresh(); }
    if (b.dataset.toggle) {
      const k = b.dataset.toggle, v = !b.classList.contains('on');
      b.classList.toggle('on', v); await saveSettings({ [k]: v });
      if (k === 'haptics') setHaptics(v);
      haptic();
      if (k === 'voice' && v) { unlockAudio(); speak('Voz ativada. Bora treinar!'); }
    }
    if (b.dataset.test != null) {
      unlockAudio();
      await saveSettings({ volume: parseFloat(el.querySelector('[data-s="volume"]').value) });
      beep({ count: 3, freq: 980, dur: 0.2 }); flash(); haptic('heavy');
      speak('Descanso acabou. Supino reto, série 2.');
    }
    if (b.dataset.saveset != null) {
      const patch = { plates: [...sel.plates].sort((a, c) => c - a) };
      for (const k of ['restCompound', 'restIsolation', 'volume', 'barKg']) {
        const v = parseFloat(String(el.querySelector(`[data-s="${k}"]`).value).replace(',', '.'));
        if (v > 0) patch[k] = v;
      }
      await saveSettings(patch); haptic(); toast('Ajustes salvos ✓', 'ok'); nav.refresh();
    }
    if (b.dataset.export != null) return doExport();
    if (b.dataset.import != null) return doImport();
    if (b.dataset.prime != null) return nav.push(renderPrime, { fullscreen: true });
    if (b.dataset.reset != null) {
      if (!await confirmSheet('Apagar tudo?', 'Histórico, fotos, dieta e configurações serão apagados deste aparelho. Isso não pode ser desfeito.', 'Apagar tudo', true)) return;
      if (!await confirmSheet('Tem certeza mesmo?', 'Última chance: sem backup, não dá para recuperar.', 'Sim, apagar', true)) return;
      for (const s of STORES) await db.clear(s);
      toast('Dados apagados'); location.reload();
    }
  };
}

export async function doExport() {
  toast('Gerando backup…');
  const data = await exportBackup();
  const name = `shape2026-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup Shape 2026' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    await kv.set('lastBackup', Date.now());
    requestPersist();
    toast('Backup pronto ✓', 'ok');
    nav.refresh();
  } catch (e) { if (e.name !== 'AbortError') toast('Não foi possível exportar: ' + e.message); }
}

function doImport() {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = 'application/json,.json';
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (!await confirmSheet('Importar backup?', `Isso substitui os dados atuais pelos do backup de ${json.exportedAt ? new Date(json.exportedAt).toLocaleString('pt-BR') : '?'}.`, 'Importar', true)) return;
      await importBackup(json);
      toast('Backup importado ✓', 'ok');
      setTimeout(() => location.reload(), 600);
    } catch (e) { toast('Erro: ' + e.message); }
  };
  i.click();
}

async function renderPrime(el) {
  const primes = await kv.get('primeLoads', {});
  el.innerHTML = `
    ${header('Cargas do prime')}
    <p class="muted">Quanto você usava no seu auge em cada exercício (kg). Na 1ª sessão, o app sugere ~55% disso. Opcional.</p>
    ${Object.values(P.workouts).map(w => `<h3 class="mt2">${w.name}</h3><div class="list">${w.exercises.filter(e => e.unit !== 's').map(e => `
      <div class="li"><div class="li-main"><b style="font-size:15px">${esc(e.name)}</b><small>${e.reps[0]}–${e.reps[1]} reps</small></div>
      <input class="field" style="width:96px;text-align:center" inputmode="decimal" data-prime="${e.id}" value="${primes[e.id] ?? ''}" placeholder="kg"></div>`).join('')}</div>`).join('')}
    <div class="dock"><button class="btn primary xl flex" data-save>Salvar</button></div>`;
  el.onclick = async e => {
    if (!e.target.closest('[data-save]')) return;
    const out = {};
    $$('[data-prime]', el).forEach(i => { const v = parseFloat(i.value.replace(',', '.')); if (v > 0) out[i.dataset.prime] = v; });
    await kv.set('primeLoads', out); toast('Cargas salvas ✓', 'ok'); nav.pop();
  };
}
