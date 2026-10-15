// Cartão do treino (imagem 1080×1350) para compartilhar pelo menu do iOS.
import { P, fmtDate, TOTAL_WEEKS } from './program.js';
import { hhmmss } from './timer.js';
import { fmtNum, toast } from './ui.js';

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export async function shareSessionCard(s, name) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cs = getComputedStyle(document.documentElement);
  const acc = cs.getPropertyValue('--accent').trim() || '#c6ff3d';
  const ink = cs.getPropertyValue('--accent-ink').trim() || '#0b0f02';
  const font = (w, px) => `${w} ${px}px -apple-system, "SF Pro Display", system-ui, sans-serif`;
  const w = P.workouts[s.workout];
  const phase = P.phases.find(p => p.id === s.phase);

  g.fillStyle = '#07080a'; g.fillRect(0, 0, W, H);
  const grad = g.createRadialGradient(W, 0, 50, W, 0, 900);
  grad.addColorStop(0, acc + '55'); grad.addColorStop(1, 'transparent');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);

  g.fillStyle = acc; g.font = font(800, 34); g.fillText('SHAPE 2026', 80, 120);
  g.fillStyle = '#8b9099'; g.font = font(600, 34);
  g.fillText(`${fmtDate(s.date, true)} · Semana ${s.week} de ${TOTAL_WEEKS} · ${phase ? phase.name : ''}`, 80, 175);
  g.fillStyle = '#f4f5f7'; g.font = font(800, 108); g.fillText(w.name, 80, 320);
  g.fillStyle = '#8b9099'; g.font = font(600, 44); g.fillText(w.focus, 80, 385);

  const stats = [
    ['Duração', hhmmss(s.endedAt - s.startedAt)],
    ['Volume', fmtNum(s.volume) + ' kg'],
    ['Séries', String(s.setsDone)],
    ['Recordes', String((s.prs || []).length)],
  ];
  stats.forEach(([l, v], i) => {
    const x = 80 + (i % 2) * 470, y = 450 + Math.floor(i / 2) * 210;
    g.fillStyle = '#15171b'; rr(g, x, y, 450, 180, 36); g.fill();
    g.fillStyle = '#8b9099'; g.font = font(600, 32); g.fillText(l, x + 36, y + 62);
    g.fillStyle = '#f4f5f7'; g.font = font(800, 64); g.fillText(v, x + 36, y + 140);
  });

  let y = 930;
  const prs = (s.prs || []).slice(0, 4);
  if (prs.length) {
    g.fillStyle = acc; g.font = font(800, 34); g.fillText('RECORDES', 80, y); y += 60;
    for (const p of prs) { g.fillStyle = '#f4f5f7'; g.font = font(650, 38); g.fillText(`🏆 ${p.name} — ${p.value}`, 80, y); y += 56; }
  } else if (s.cardio && s.cardio.done) {
    g.fillStyle = '#f4f5f7'; g.font = font(650, 40); g.fillText(`🚶 + ${s.cardio.minutes} min de esteira`, 80, y);
  }

  g.fillStyle = acc; rr(g, 80, H - 170, W - 160, 96, 48); g.fill();
  g.fillStyle = ink; g.font = font(800, 40); g.textAlign = 'center';
  g.fillText(name ? `${name} · treino concluído ✓` : 'Treino concluído ✓', W / 2, H - 108);

  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], `treino-${s.date}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
    else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
    }
  } catch (e) { if (e.name !== 'AbortError') toast('Não foi possível compartilhar'); }
}
