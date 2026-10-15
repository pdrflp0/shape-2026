// Perfil e configurações: dados pessoais, cargas do prime, timer, som, backup.
import { db, kv, exportBackup, importBackup, requestPersist, STORES } from '../db.js';
import { P } from '../program.js';
import { nav, header, toast, esc, ICON, confirmSheet, $$ } from '../ui.js';
import { ACTIVITY, getProfile, nutritionTargets } from './diet.js';
import { beep, unlockAudio } from '../timer.js';

export async function renderProfile(el) {
  const p = await getProfile();
  const st = Object.assign({ restCompound: P.rest.compound, restIsolation: P.rest.isolation, sound: true, volume: 0.6, waterGoal: '' }, await kv.get('settings', {}));
  const t = await nutritionTargets();
  const lastBackup = await kv.get('lastBackup', null);
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  el.innerHTML = `
    <div class="top-hello"><div class="eyebrow">Perfil</div><h1>Você</h1></div>
    <div class="stack mt">
      <div class="card">
        <div class="card-title">Dados pessoais</div>
        <label class="lbl">Nome</label><input class="field" data-p="name" value="${esc(p.name)}" placeholder="Seu nome">
        <div class="form-grid">
          <div><label class="lbl">Sexo</label><select class="field" data-p="sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Masculino</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Feminino</option></select></div>
          <div><label class="lbl">Idade</label><input class="field" data-p="age" inputmode="numeric" value="${p.age}" placeholder="anos"></div>
          <div><label class="lbl">Altura (cm)</label><input class="field" data-p="height" inputmode="numeric" value="${p.height}" placeholder="178"></div>
          <div><label class="lbl">Peso inicial (kg)</label><input class="field" data-p="weight" inputmode="decimal" value="${String(p.weight).replace('.', ',')}"></div>
        </div>
        <label class="lbl">Nível de atividade</label>
        <select class="field" data-p="activity">${ACTIVITY.map(a => `<option value="${a.v}" ${+p.activity === a.v ? 'selected' : ''}>${a.v} · ${a.label}</option>`).join('')}</select>
        <button class="btn primary block mt" data-saveprof>Salvar perfil</button>
        ${t.kcal ? `<div class="info-box mt">Gasto ≈ <b>${Math.round(t.tdee)} kcal</b> · Meta <b>${t.kcal} kcal</b> · Proteína <b>${t.protein} g</b> (peso base ${String(Math.round(t.kg * 10) / 10).replace('.', ',')} kg, ${t.weightSource})</div>` : ''}
      </div>

      <div class="list">
        <div class="li tap" data-prime><div class="li-main"><b>Cargas do "prime"</b><small>Base para a 1ª sessão (sugere ~55%)</small></div><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>
      </div>

      <div class="card">
        <div class="card-title">Timer de descanso</div>
        <div class="form-grid">
          <div><label class="lbl">Compostos ★ (s)</label><input class="field" data-s="restCompound" inputmode="numeric" value="${st.restCompound}"></div>
          <div><label class="lbl">Isolados (s)</label><input class="field" data-s="restIsolation" inputmode="numeric" value="${st.restIsolation}"></div>
        </div>
        <div class="row between mt"><b>Som ao terminar</b><button class="chip ${st.sound ? 'on' : ''}" data-sound>${st.sound ? 'Ligado' : 'Desligado'}</button></div>
        <label class="lbl">Volume do beep</label><input type="range" min="0.1" max="1" step="0.1" value="${st.volume}" data-s="volume" style="width:100%;accent-color:var(--accent)">
        <button class="btn block mt" data-test>🔔 Testar beep</button>
        <p class="muted" style="font-size:13px">No iPhone, deixe a chave lateral fora do modo silencioso para ouvir o beep. O flash na tela sempre aparece.</p>
        <label class="lbl">Meta de água (L) — vazio = automático (${t.water} L)</label><input class="field" data-s="waterGoal" inputmode="decimal" value="${st.waterGoal}">
        <button class="btn primary block mt" data-saveset>Salvar ajustes</button>
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
      <p class="center dim" style="font-size:12px">Shape 2026 · funciona 100% offline · dados só no seu aparelho</p>
    </div>`;

  el.onclick = async e => {
    const b = e.target.closest('button, [data-prime], [data-reset]'); if (!b) return;
    if (b.dataset.saveprof != null) {
      const np = {};
      $$('[data-p]', el).forEach(i => { np[i.dataset.p] = i.value.trim(); });
      np.weight = parseFloat(String(np.weight).replace(',', '.')) || 83;
      np.activity = parseFloat(np.activity);
      await kv.set('profile', np); toast('Perfil salvo ✓', 'ok'); nav.refresh();
    }
    if (b.dataset.sound != null) { st.sound = !st.sound; await kv.set('settings', Object.assign(await kv.get('settings', {}), { sound: st.sound })); nav.refresh(); }
    if (b.dataset.test != null) {
      unlockAudio();
      const v = parseFloat(el.querySelector('[data-s="volume"]').value);
      await kv.set('settings', Object.assign(await kv.get('settings', {}), { volume: v }));
      beep({ count: 3, freq: 980, dur: 0.2 });
      const { flash } = await import('../timer.js'); flash();
    }
    if (b.dataset.saveset != null) {
      const cur = await kv.get('settings', {});
      $$('[data-s]', el).forEach(i => {
        const k = i.dataset.s, v = parseFloat(String(i.value).replace(',', '.'));
        if (k === 'waterGoal') cur[k] = v > 0 ? v : '';
        else if (v > 0) cur[k] = v;
      });
      await kv.set('settings', cur); toast('Ajustes salvos ✓', 'ok'); nav.refresh();
    }
    if (b.dataset.export != null) return doExport();
    if (b.dataset.import != null) return doImport();
    if (b.dataset.prime != null) return nav.push(renderPrime, { fullscreen: true });
    if (b.dataset.reset != null) {
      if (!await confirmSheet('Apagar tudo?', 'Histórico, fotos, dieta e configurações serão apagados deste aparelho. Isso não pode ser desfeito.', 'Apagar tudo', true)) return;
      for (const s of STORES) await db.clear(s);
      toast('Dados apagados'); location.reload();
    }
  };
}

async function doExport() {
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
