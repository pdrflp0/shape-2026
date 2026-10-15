// Ilustrações SVG animadas próprias: um boneco estilizado por exercício.
// Cada animação tem duas poses (A = início, B = fim). O app interpola entre elas em loop.
// Coordenadas num viewBox 200×160, chão em y=150.

const P = (o) => o;
const STAND = { head: [100, 24], sh: [100, 42], el: [102, 66], ha: [104, 90], hip: [100, 88], kn: [102, 117], an: [100, 146], toe: [112, 148] };
const S = (o) => Object.assign({}, STAND, o);

// ---------- Cenários (estáticos) ----------
const r = (x, y, w, h, rx = 3, c = 'eq') => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const l = (x1, y1, x2, y2, c = 'eqs') => `<line class="${c}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const floor = l(10, 150, 190, 150, 'floor');
const bench = (x1, x2, y) => r(x1, y, x2 - x1, 6) + l(x1 + 8, y + 6, x1 + 8, 150) + l(x2 - 8, y + 6, x2 - 8, 150);
const column = (x, y1 = 6) => r(x - 3, y1, 6, 150 - y1, 2, 'eq2');
const pulley = (x, y) => `<circle class="eqs" cx="${x}" cy="${y}" r="4"/>`;

// ---------- Props (dependem da pose) ----------
const plate = (p, rr = 13) => `<circle class="wt" cx="${p[0]}" cy="${p[1]}" r="${rr}"/><circle class="wt2" cx="${p[0]}" cy="${p[1]}" r="${rr * 0.35}"/>`;
const dumb = (p) => `<rect class="wt" x="${p[0] - 9}" y="${p[1] - 4}" width="18" height="8" rx="3"/><rect class="wt" x="${p[0] - 11}" y="${p[1] - 7}" width="6" height="14" rx="2"/><rect class="wt" x="${p[0] + 5}" y="${p[1] - 7}" width="6" height="14" rx="2"/>`;
const cable = (from, p) => `<line class="cable" x1="${from[0]}" y1="${from[1]}" x2="${p[0]}" y2="${p[1]}"/>`;
const handle = (p) => `<rect class="wt" x="${p[0] - 3}" y="${p[1] - 7}" width="6" height="14" rx="3"/>`;
const pad = (p, rr = 6) => `<circle class="pad" cx="${p[0]}" cy="${p[1]}" r="${rr}"/>`;
const mir = (p, cx = 100) => [2 * cx - p[0], p[1]];

export const ANIMS = {
  bench: {
    scene: floor + bench(60, 165, 108),
    a: P({ head: [160, 100], sh: [144, 104], hip: [96, 106], kn: [70, 104], an: [62, 146], toe: [74, 148], el: [144, 80], ha: [144, 58] }),
    b: P({ el: [124, 116], ha: [138, 94] }),
    props: p => plate(p.ha),
  },
  machinePress: {
    scene: floor + r(56, 108, 40, 6) + r(56, 40, 8, 74) + l(76, 114, 76, 150) + column(150, 20) + l(150, 60, 120, 64, 'eqs'),
    a: P({ head: [74, 48], sh: [76, 64], hip: [72, 108], kn: [100, 108], an: [104, 146], toe: [116, 148], el: [62, 74], ha: [84, 66] }),
    b: P({ el: [98, 66], ha: [120, 64] }),
    props: p => handle(p.ha),
  },
  row: {
    scene: floor,
    a: P({ head: [140, 52], sh: [128, 60], hip: [90, 90], kn: [104, 116], an: [98, 146], toe: [110, 148], el: [130, 84], ha: [132, 106] }),
    b: P({ el: [106, 72], ha: [118, 92] }),
    props: p => plate(p.ha),
  },
  ohp: {
    scene: floor + bench(70, 120, 112) + r(70, 52, 7, 60),
    a: P({ head: [96, 40], sh: [94, 56], hip: [90, 110], kn: [120, 110], an: [122, 146], toe: [134, 148], el: [106, 72], ha: [104, 50] }),
    b: P({ el: [100, 34], ha: [100, 12] }),
    props: p => dumb(p.ha),
  },
  pulldown: {
    scene: floor + column(150) + l(104, 6, 150, 6, 'eqs') + pulley(104, 8) + bench(66, 112, 120) + r(108, 100, 16, 7, 3, 'eq'),
    a: P({ head: [94, 58], sh: [92, 74], hip: [88, 120], kn: [116, 118], an: [118, 146], toe: [130, 148], el: [98, 50], ha: [104, 28] }),
    b: P({ head: [88, 58], sh: [88, 74], el: [94, 94], ha: [106, 74] }),
    props: p => cable([104, 8], p.ha) + `<line class="bar" x1="${p.ha[0] - 16}" y1="${p.ha[1] + 2}" x2="${p.ha[0] + 16}" y2="${p.ha[1] - 2}"/>`,
  },
  lateral: {
    mirror: true,
    scene: floor,
    a: P({ head: [100, 24], neck: [100, 40], sh: [114, 44], el: [118, 68], ha: [120, 90], pel: [100, 88], hip: [108, 90], kn: [110, 118], an: [110, 146], toe: [116, 148] }),
    b: P({ el: [136, 46], ha: [156, 50] }),
    props: p => dumb(p.ha) + dumb(p.ha2),
  },
  cableLateral: {
    mirror: true,
    scene: floor + column(58, 30) + pulley(62, 142),
    a: P({ head: [100, 24], neck: [100, 40], sh: [114, 44], el: [118, 68], ha: [120, 90], pel: [100, 88], hip: [108, 90], kn: [110, 118], an: [110, 146], toe: [116, 148], el2: [84, 66], ha2: [94, 88] }),
    b: P({ el: [136, 46], ha: [156, 50] }),
    props: p => cable([62, 142], p.ha) + handle(p.ha),
  },
  curl: {
    scene: floor,
    a: S({ el: [102, 68], ha: [106, 90] }),
    b: P({ ha: [112, 48] }),
    props: p => plate(p.ha, 8),
  },
  pushdown: {
    scene: floor + column(146) + pulley(140, 10) + l(140, 6, 146, 6, 'eqs'),
    a: S({ head: [104, 24], sh: [102, 42], hip: [98, 88], el: [104, 66], ha: [122, 56] }),
    b: P({ ha: [110, 88] }),
    props: p => cable([140, 10], p.ha) + `<line class="rope" x1="${p.ha[0]}" y1="${p.ha[1]}" x2="${p.ha[0] - 4}" y2="${p.ha[1] + 8}"/><line class="rope" x1="${p.ha[0]}" y1="${p.ha[1]}" x2="${p.ha[0] + 5}" y2="${p.ha[1] + 8}"/>`,
  },
  squat: {
    scene: floor + column(156, 18) + r(146, 50, 14, 5, 2, 'eq'),
    a: P({ head: [98, 22], sh: [98, 40], hip: [98, 86], kn: [100, 116], an: [98, 146], toe: [110, 148], el: [84, 52], ha: [94, 40] }),
    b: P({ head: [126, 74], sh: [115, 88], hip: [85, 123], kn: [115, 121], el: [102, 98], ha: [112, 86] }),
    props: p => plate([p.sh[0] - 2, p.sh[1] - 3], 14),
  },
  hack: {
    scene: floor + l(56, 30, 76, 150, 'eqs') + r(90, 142, 34, 6, 2, 'eq'),
    a: P({ head: [90, 22], sh: [88, 40], hip: [86, 88], kn: [96, 116], an: [100, 144], toe: [112, 144], el: [80, 52], ha: [86, 40] }),
    b: P({ head: [78, 56], sh: [76, 72], hip: [72, 118], kn: [102, 116], el: [68, 84], ha: [76, 72] }),
    props: p => `<line class="padl" x1="${p.hip[0] - 9}" y1="${p.hip[1] + 4}" x2="${p.sh[0] - 9}" y2="${p.sh[1] - 4}"/>` + `<rect class="wt" x="${p.sh[0] - 6}" y="${p.sh[1] - 9}" width="16" height="7" rx="3"/>`,
  },
  rdl: {
    scene: floor,
    a: S({ el: [100, 66], ha: [100, 90] }),
    b: P({ head: [138, 68], sh: [123, 72], hip: [80, 88], kn: [100, 118], el: [123, 96], ha: [123, 118] }),
    props: p => plate(p.ha),
  },
  legpress: {
    scene: floor + l(96, 136, 176, 56, 'eqs') + `<line class="padl" x1="26" y1="78" x2="70" y2="130"/>` + r(60, 128, 30, 6, 2, 'eq'),
    a: P({ head: [30, 80], sh: [42, 92], hip: [70, 122], kn: [92, 98], an: [118, 78], toe: [124, 70], el: [56, 106], ha: [66, 116] }),
    b: P({ kn: [72, 92], an: [96, 100], toe: [102, 92] }),
    props: p => `<line class="bar" x1="${p.an[0] - 10}" y1="${p.an[1] - 14}" x2="${p.an[0] + 14}" y2="${p.an[1] + 10}"/>` + plate([p.an[0] + 12, p.an[1] - 10], 9),
  },
  lyingCurl: {
    scene: floor + bench(40, 150, 108),
    a: P({ head: [160, 94], sh: [142, 100], hip: [92, 102], kn: [62, 102], an: [34, 102], toe: [28, 96], el: [150, 118], ha: [160, 112] }),
    b: P({ an: [70, 75], toe: [78, 72] }),
    props: p => pad(p.an, 6) + l(p.an[0], p.an[1], 40, 128, 'cable') + plate([40, 132], 8),
  },
  seatedCurl: {
    scene: floor + bench(58, 106, 110) + r(58, 54, 7, 56),
    a: P({ head: [80, 46], sh: [78, 62], hip: [84, 108], kn: [112, 108], an: [140, 110], toe: [146, 102], el: [88, 84], ha: [100, 100] }),
    b: P({ an: [104, 135], toe: [110, 141] }),
    props: p => pad(p.an, 6) + r(p.kn[0] - 16, p.kn[1] - 12, 18, 6, 3, 'pad'),
  },
  legExt: {
    scene: floor + bench(58, 106, 110) + r(58, 54, 7, 56),
    a: P({ head: [80, 46], sh: [78, 62], hip: [84, 108], kn: [112, 108], an: [116, 136], toe: [126, 140], el: [88, 84], ha: [100, 108] }),
    b: P({ an: [140, 104], toe: [146, 96] }),
    props: p => pad([p.an[0] + 3, p.an[1] - 3], 6),
  },
  calf: {
    scene: floor + r(96, 140, 30, 10, 2, 'eq'),
    a: P({ head: [100, 24], sh: [100, 42], hip: [100, 88], kn: [101, 116], an: [102, 144], toe: [118, 140], el: [90, 58], ha: [98, 42] }),
    b: P({ head: [100, 14], sh: [100, 32], hip: [100, 78], kn: [101, 106], an: [104, 134], el: [90, 48], ha: [98, 32] }),
    props: p => `<rect class="wt" x="${p.sh[0] - 8}" y="${p.sh[1] - 8}" width="20" height="7" rx="3"/>`,
  },
  seatedCalf: {
    scene: floor + bench(58, 104, 112) + r(110, 140, 26, 8, 2, 'eq'),
    a: P({ head: [80, 48], sh: [80, 64], hip: [84, 110], kn: [112, 108], an: [114, 142], toe: [128, 140], el: [92, 84], ha: [108, 98] }),
    b: P({ kn: [112, 100], an: [114, 134], ha: [108, 90], el: [92, 80] }),
    props: p => `<rect class="wt" x="${p.kn[0] - 10}" y="${p.kn[1] - 12}" width="22" height="7" rx="3"/>`,
  },
  plank: {
    dur: 3200,
    scene: floor,
    a: P({ head: [154, 116], sh: [138, 124], hip: [92, 126], kn: [66, 132], an: [40, 138], toe: [38, 148], el: [138, 146], ha: [156, 146] }),
    b: P({ hip: [92, 122], kn: [66, 130] }),
    props: () => '',
  },
  incline: {
    scene: floor + `<line class="padl" x1="74" y1="118" x2="132" y2="84"/>` + l(84, 118, 84, 150) + l(120, 96, 120, 150),
    a: P({ head: [132, 80], sh: [120, 92], hip: [80, 112], kn: [56, 110], an: [52, 146], toe: [62, 148], el: [122, 68], ha: [124, 46] }),
    b: P({ el: [104, 106], ha: [118, 86] }),
    props: p => dumb(p.ha),
  },
  seatedRow: {
    scene: floor + bench(48, 92, 124) + r(126, 108, 6, 34, 2, 'eq') + column(156, 90) + pulley(150, 118),
    a: P({ head: [92, 68], sh: [86, 82], hip: [70, 122], kn: [100, 106], an: [124, 120], toe: [128, 110], el: [106, 93], ha: [126, 105] }),
    b: P({ head: [78, 66], sh: [76, 80], el: [58, 96], ha: [80, 106] }),
    props: p => cable([150, 118], p.ha) + `<path class="bar" d="M${p.ha[0] - 4} ${p.ha[1] - 6} L${p.ha[0] + 6} ${p.ha[1]} L${p.ha[0] - 4} ${p.ha[1] + 6} Z"/>`,
  },
  fly: {
    mirror: true,
    scene: floor + r(96, 16, 8, 120, 2, 'eq2') + r(86, 100, 28, 6),
    a: P({ head: [100, 26], neck: [100, 42], sh: [114, 46], el: [140, 52], ha: [148, 32], pel: [100, 96], hip: [108, 98], kn: [112, 114], an: [112, 146], toe: [116, 148] }),
    b: P({ el: [122, 58], ha: [106, 40] }),
    props: p => handle(p.ha) + handle(p.ha2),
  },
  facepull: {
    scene: floor + column(182) + pulley(176, 30),
    a: S({ el: [122, 40], ha: [145, 35] }),
    b: P({ el: [86, 32], ha: [108, 24] }),
    props: p => cable([176, 30], p.ha) + `<line class="rope" x1="${p.ha[0]}" y1="${p.ha[1]}" x2="${p.ha[0] - 3}" y2="${p.ha[1] + 9}"/>`,
  },
  inclineCurl: {
    scene: floor + `<line class="padl" x1="54" y1="62" x2="88" y2="116"/>` + bench(80, 116, 116),
    a: P({ head: [62, 64], sh: [72, 80], hip: [92, 114], kn: [120, 112], an: [122, 146], toe: [134, 148], el: [66, 104], ha: [62, 126] }),
    b: P({ ha: [84, 90] }),
    props: p => dumb(p.ha),
  },
  overheadExt: {
    scene: floor + column(20) + pulley(26, 40),
    a: P({ head: [114, 32], sh: [110, 46], hip: [96, 90], kn: [104, 118], an: [100, 146], toe: [112, 148], kn2: [88, 118], an2: [80, 146], toe2: [90, 148], el: [124, 26], ha: [104, 18] }),
    b: P({ ha: [137, 8] }),
    props: p => cable([26, 40], p.ha) + `<line class="rope" x1="${p.ha[0]}" y1="${p.ha[1]}" x2="${p.ha[0] - 6}" y2="${p.ha[1] + 6}"/>`,
  },
  bulgarian: {
    scene: floor + bench(28, 72, 116),
    a: P({ head: [100, 20], sh: [100, 38], hip: [98, 84], kn: [110, 112], an: [112, 146], toe: [124, 148], kn2: [84, 108], an2: [64, 114], toe2: [58, 110], el: [102, 62], ha: [104, 84] }),
    b: P({ head: [100, 44], sh: [100, 62], hip: [96, 108], kn: [122, 112], kn2: [88, 138], an2: [64, 118], toe2: [58, 113], el: [102, 86], ha: [104, 108] }),
    props: p => dumb(p.ha),
  },
  hipThrust: {
    scene: floor + bench(18, 60, 102),
    a: P({ head: [44, 90], sh: [56, 100], hip: [84, 136], kn: [114, 118], an: [126, 146], toe: [138, 148], el: [70, 122], ha: [84, 128] }),
    b: P({ hip: [96, 108], kn: [126, 114], el: [76, 98], ha: [94, 100] }),
    props: p => plate([p.hip[0], p.hip[1] - 10], 13),
  },
  cableCrunch: {
    scene: floor + column(150) + pulley(142, 14),
    a: P({ head: [104, 58], sh: [100, 72], hip: [94, 116], kn: [96, 146], an: [66, 146], toe: [60, 143], el: [112, 64], ha: [106, 56] }),
    b: P({ head: [136, 106], sh: [126, 98], hip: [96, 116], el: [134, 90], ha: [132, 96] }),
    props: p => cable([142, 14], p.ha),
  },
};

// ---------- Desenho ----------
function lerpPose(a, b, k) {
  const o = {};
  for (const key in a) {
    const q = b[key] || a[key];
    o[key] = [a[key][0] + (q[0] - a[key][0]) * k, a[key][1] + (q[1] - a[key][1]) * k];
  }
  return o;
}
const seg = (pts, c) => `<polyline class="${c}" points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;

function body(def, p) {
  p.neck = p.neck || p.sh; p.pel = p.pel || p.hip;
  const cx = p.neck[0];
  if (def.mirror) {
    for (const k of ['sh', 'el', 'ha', 'hip', 'kn', 'an', 'toe']) if (!p[k + '2']) p[k + '2'] = mir(p[k], cx);
    if (!p.sh2) p.sh2 = mir(p.sh, cx);
  }
  let s = '';
  // membros de trás (mais apagados)
  // vista frontal (espelhada): os dois lados com a mesma cor; vista lateral: lado de trás apagado
  const back = def.mirror ? 'limb' : 'limb back';
  if (p.kn2) s += seg([p.hip2 || p.hip, p.kn2, p.an2, p.toe2 || p.an2], back);
  if (p.el2) s += seg([p.sh2 || p.sh, p.el2, p.ha2], back);
  // tronco
  s += seg([p.neck, p.pel], 'limb torso');
  if (def.mirror) s += seg([p.sh2, p.sh], 'limb') + seg([p.hip2, p.hip], 'limb');
  s += seg([p.hip, p.kn, p.an, p.toe], 'limb');
  s += seg([p.sh, p.el, p.ha], 'limb arm');
  s += `<circle class="head" cx="${p.head[0].toFixed(1)}" cy="${p.head[1].toFixed(1)}" r="9"/>`;
  return s;
}

function frame(def, k) {
  const b = Object.assign({}, def.a, def.b);
  const p = lerpPose(def.a, b, k);
  // pose espelhada para props (ha2)
  if (def.mirror) { p.neck = p.neck || p.sh; if (!p.ha2) p.ha2 = mir(p.ha, p.neck[0]); }
  return body(def, p) + def.props(p);
}

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const live = new Set();
let running = false;
function tick(now) {
  for (const f of live) {
    if (!f.el.isConnected) { live.delete(f); continue; }
    const dur = f.def.dur || 2400;
    const t = ((now - f.t0) % dur) / dur;
    // ida e volta suave com pequena pausa nas extremidades
    let k = (1 - Math.cos(2 * Math.PI * t)) / 2;
    k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    f.g.innerHTML = frame(f.def, k);
  }
  if (live.size) requestAnimationFrame(tick); else running = false;
}

// Retorna o HTML de um SVG; animado = true para entrar no loop após inserir no DOM.
export function figureSVG(anim, { animated = false, cls = '' } = {}) {
  const def = ANIMS[anim] || ANIMS.curl;
  const id = 'fg' + Math.random().toString(36).slice(2, 8);
  return `<svg class="fig ${cls}" viewBox="0 0 200 160" role="img" aria-label="Ilustração da execução" data-anim="${animated ? anim : ''}" id="${id}">
    <g class="scene">${def.scene}</g><g class="dyn">${frame(def, 0.65)}</g></svg>`;
}

export function animateFigures(root = document) {
  if (reduce()) return;
  root.querySelectorAll('svg.fig[data-anim]:not([data-anim=""])').forEach(el => {
    if (el._live) return;
    el._live = true;
    live.add({ el, g: el.querySelector('.dyn'), def: ANIMS[el.dataset.anim] || ANIMS.curl, t0: performance.now() });
  });
  if (!running && live.size) { running = true; requestAnimationFrame(tick); }
}
