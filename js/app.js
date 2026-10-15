// Boot do app: carrega o programa, registra o service worker e monta as abas.
import { loadProgram } from './program.js';
import { nav, ICON, $$, applyTheme, setHaptics } from './ui.js';
import { requestPersist, kv } from './db.js';
import { unlockAudio, hhmmss, keepAwake } from './timer.js';
import { renderToday } from './screens/today.js';
import { renderWorkouts } from './screens/workouts.js';
import { renderProgress } from './screens/progress.js';
import { renderDiet } from './screens/diet.js';
import { renderProfile } from './screens/profile.js';
import { getActive, restoreRest } from './screens/session.js';

const TABS = [
  ['today', 'Hoje', renderToday],
  ['workouts', 'Treinos', renderWorkouts],
  ['progress', 'Progresso', renderProgress],
  ['diet', 'Dieta', renderDiet],
  ['profile', 'Perfil', renderProfile],
];

async function boot() {
  // preferências visuais antes do primeiro render (evita piscar a cor padrão)
  const st = await kv.get('settings', {});
  applyTheme(st.theme || 'lime');
  setHaptics(st.haptics !== false);
  await loadProgram();
  const bar = document.getElementById('tabbar');
  bar.innerHTML = TABS.map(([k, l]) => `<button class="tab" data-tab="${k}">${ICON[k]}<span>${l}</span></button>`).join('');
  bar.onclick = e => {
    const b = e.target.closest('.tab'); if (!b) return;
    const t = TABS.find(x => x[0] === b.dataset.tab);
    $$('.tab', bar).forEach(x => x.classList.toggle('on', x === b));
    if (nav.tab === t[0] && nav.stack.length === 1) { nav.top().el.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    nav.root(t[0], t[2]);
  };
  bar.querySelector('[data-tab="today"]').classList.add('on');
  await nav.root('today', renderToday);
  document.getElementById('splash').classList.add('gone');

  // relógio de treino em qualquer elemento [data-elapsed]
  setInterval(() => $$('[data-elapsed]').forEach(n => { n.textContent = hhmmss(Date.now() - +n.dataset.elapsed); }), 1000);

  // áudio do iOS só destrava após um toque
  const first = () => { unlockAudio(); requestPersist(); document.removeEventListener('touchend', first); document.removeEventListener('click', first); };
  document.addEventListener('touchend', first, { passive: true });
  document.addEventListener('click', first);

  // se havia um treino em andamento, mantém tela acesa e restaura o descanso
  if (await getActive()) { keepAwake(true); restoreRest(); }

  // ao voltar para o app, atualiza a tela (ex.: mudou o dia)
  let lastDay = new Date().getDate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && new Date().getDate() !== lastDay) { lastDay = new Date().getDate(); nav.refresh(nav.stack[0]); }
  });
}

// Nova versão baixada: oferece recarregar (treino em andamento e descanso são restaurados depois)
function showUpdate() {
  if (document.querySelector('.update-bar')) return;
  const b = document.createElement('div');
  b.className = 'update-bar';
  b.innerHTML = '<span>✨ Nova versão do app pronta</span><button class="btn sm primary">Atualizar</button>';
  b.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(b);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // o iOS mantém o app aberto por dias: procura versão nova sempre que ele volta para a frente
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        });
      });
    }).catch(() => {});
  });
}

boot().catch(err => {
  console.error(err);
  document.getElementById('splash').innerHTML = `<p style="padding:24px;color:#ff5a5f">Erro ao iniciar: ${err.message}</p>`;
});
