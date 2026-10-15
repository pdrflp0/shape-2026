// Boot do app: carrega o programa, registra o service worker e monta as abas.
import { loadProgram } from './program.js';
import { nav, ICON, $$, toast } from './ui.js';
import { requestPersist } from './db.js';
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Atualização baixada — reabra o app para aplicar');
        });
      });
    }).catch(() => {});
  });
}

boot().catch(err => {
  console.error(err);
  document.getElementById('splash').innerHTML = `<p style="padding:24px;color:#ff5a5f">Erro ao iniciar: ${err.message}</p>`;
});
