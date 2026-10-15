// Gráficos SVG leves que "se desenham" ao abrir (stroke-dashoffset animado no CSS).
import { fmtShort } from './program.js';

const W = 340, H = 180, PL = 34, PR = 10, PT = 12, PB = 24;

function scale(series, opts) {
  const xs = [], ys = [];
  for (const s of series) for (const p of s.points) { xs.push(p.x); ys.push(p.y); }
  if (opts.extraY) ys.push(...opts.extraY);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (opts.xMin != null) x0 = Math.min(x0, opts.xMin);
  if (opts.xMax != null) x1 = Math.max(x1, opts.xMax);
  if (x1 === x0) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.12 || Math.max(1, Math.abs(y1) * 0.05);
  y0 -= pad; y1 += pad;
  if (opts.zero) y0 = Math.min(0, y0);
  const sx = x => PL + (x - x0) / (x1 - x0) * (W - PL - PR);
  const sy = y => H - PB - (y - y0) / (y1 - y0) * (H - PT - PB);
  return { x0, x1, y0, y1, sx, sy };
}

const path = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

export function lineChart(series, opts = {}) {
  series = series.filter(s => s.points.length);
  if (!series.length) return `<div class="empty-chart">${opts.empty || 'Sem dados ainda'}</div>`;
  const { x0, x1, y0, y1, sx, sy } = scale(series, opts);
  const fmt = opts.yFmt || (v => Math.round(v));
  let g = '';
  // grade
  for (let i = 0; i <= 3; i++) {
    const v = y0 + (y1 - y0) * i / 3, y = sy(v);
    g += `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}"/><text class="axis" x="${PL - 6}" y="${y + 3}" text-anchor="end">${fmt(v)}</text>`;
  }
  // eixo x (datas)
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = x0 + (x1 - x0) * i / ticks;
    g += `<text class="axis" x="${sx(v)}" y="${H - 6}" text-anchor="middle">${opts.xFmt ? opts.xFmt(v) : fmtShort(new Date(v))}</text>`;
  }
  // faixa de meta
  if (opts.band) {
    const [ya, yb] = opts.band;
    g += `<rect class="band" x="${PL}" width="${W - PL - PR}" y="${sy(yb)}" height="${Math.max(1, sy(ya) - sy(yb))}"/>`;
  }
  if (opts.guide) g += `<path class="guide" d="${path(opts.guide.map(p => [sx(p.x), sy(p.y)]))}"/>`;
  series.forEach((s, si) => {
    const pts = s.points.map(p => [sx(p.x), sy(p.y)]);
    if (s.area && pts.length > 1) {
      g += `<path class="area ${s.cls || ''}" d="${path(pts)} L${pts[pts.length - 1][0]} ${H - PB} L${pts[0][0]} ${H - PB} Z"/>`;
    }
    if (s.line !== false && pts.length > 1) g += `<path class="ln draw ${s.cls || ''}" pathLength="1" style="animation-delay:${si * 150}ms" d="${path(pts)}"/>`;
    if (s.dots !== false) pts.forEach((p, i) => { g += `<circle class="dot ${s.cls || ''}" style="animation-delay:${200 + i * 20}ms" cx="${p[0]}" cy="${p[1]}" r="${s.r || 3}"/>`; });
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

export function barChart(points, opts = {}) {
  if (!points.length) return `<div class="empty-chart">${opts.empty || 'Sem dados ainda'}</div>`;
  const max = Math.max(...points.map(p => p.y)) * 1.1 || 1;
  const bw = Math.min(44, (W - PL - PR) / points.length);
  let g = '';
  for (let i = 0; i <= 2; i++) {
    const v = max * i / 2, y = H - PB - v / max * (H - PT - PB);
    g += `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}"/><text class="axis" x="${PL - 6}" y="${y + 3}" text-anchor="end">${opts.yFmt ? opts.yFmt(v) : Math.round(v)}</text>`;
  }
  points.forEach((p, i) => {
    const h = p.y / max * (H - PT - PB), x = PL + i * bw + bw * 0.18, w = bw * 0.64;
    g += `<rect class="barr grow" style="animation-delay:${i * 40}ms;transform-origin:${x}px ${H - PB}px" x="${x}" y="${H - PB - h}" width="${w}" height="${h}" rx="3"/>`;
    if (points.length <= 12 || i % Math.ceil(points.length / 8) === 0) g += `<text class="axis" x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${p.label}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

// Anel de progresso (usado em vários cards)
export function ring(pct, { size = 64, stroke = 7, cls = '', label = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" style="--c:${c};--off:${off}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    ${label ? `<text x="50%" y="54%" text-anchor="middle" class="ring-label">${label}</text>` : ''}</svg>`;
}
