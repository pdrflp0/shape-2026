// Utilitários de interface: navegação com transições, bottom sheets, toasts, confete, imagens.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmtNum = (n, d = 0) => (n == null || isNaN(n)) ? '–' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const ICON = {
  today: '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.6H20l-4.9 3.6 1.9 5.8-5-3.6-5 3.6 1.9-5.8L4 8.6h6.1z"/></svg>',
  workouts: '<svg viewBox="0 0 24 24"><path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/></svg>',
  progress: '<svg viewBox="0 0 24 24"><path d="M4 19l5-6 4 3 7-9M4 4v15h16"/></svg>',
  diet: '<svg viewBox="0 0 24 24"><path d="M12 21c-4 0-7-3-7-7 0-4 3-7 7-8 4 1 7 4 7 8 0 4-3 7-7 7zM12 6c0-2 1-3 3-3"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path class="ck" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
  video: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>',
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/></svg>',
  steps: '<svg viewBox="0 0 24 24"><path d="M8 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM6 15h4v2a2 2 0 01-4 0zM16 7c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM14 19h4v1a2 2 0 01-4 0z"/></svg>',
  scale: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M9 9a4 4 0 016 0l-3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>',
};

// ---------- Navegação ----------
const viewsEl = () => $('#views');
// a animação de entrada usa transform; removê-la ao terminar evita que elementos position:fixed (dock) rolem junto
const settle = el => el.addEventListener('animationend', e => { if (e.target === el) el.classList.remove('enter-slide', 'enter-fade'); });
export const nav = {
  stack: [],
  tab: 'today',
  roots: {},
  async root(tab, render) {
    this.tab = tab;
    const old = this.stack.slice();
    const el = document.createElement('section');
    el.className = 'view root enter-fade';
    settle(el);
    viewsEl().appendChild(el);
    const v = { el, render, opts: {} };
    this.stack = [v];
    await render(el, v);
    afterRender(el);
    old.forEach(o => { o.el.classList.add('leave-fade'); setTimeout(() => o.el.remove(), 260); });
    document.body.classList.toggle('hide-tabs', false);
  },
  async push(render, opts = {}) {
    const el = document.createElement('section');
    el.className = 'view pushed enter-slide';
    settle(el);
    viewsEl().appendChild(el);
    const v = { el, render, opts };
    const below = this.stack[this.stack.length - 1];
    this.stack.push(v);
    await render(el, v);
    afterRender(el);
    if (below) below.el.classList.add('behind');
    document.body.classList.toggle('hide-tabs', !!opts.fullscreen || this.stack.some(s => s.opts.fullscreen));
    return v;
  },
  async pop(n = 1) {
    for (let i = 0; i < n && this.stack.length > 1; i++) {
      const v = this.stack.pop();
      v.el.classList.add('leave-slide');
      v.opts.onClose && v.opts.onClose();
      setTimeout(() => v.el.remove(), reduceMotion() ? 0 : 300);
    }
    const top = this.stack[this.stack.length - 1];
    top.el.classList.remove('behind');
    document.body.classList.toggle('hide-tabs', this.stack.some(s => s.opts.fullscreen));
    await this.refresh(top);
  },
  async refresh(v = this.stack[this.stack.length - 1], { animate = false } = {}) {
    if (!v) return;
    const st = v.el.scrollTop;
    v.el.classList.toggle('static', !animate); // re-render sem repetir as animações de entrada
    await v.render(v.el, v);
    afterRender(v.el);
    v.el.scrollTop = st;
  },
  top() { return this.stack[this.stack.length - 1]; },
};

let afterHooks = [];
export const onAfterRender = fn => afterHooks.push(fn);
function afterRender(el) { afterHooks.forEach(f => f(el)); }

document.addEventListener('click', e => {
  if (e.target.closest('[data-back]')) nav.pop();
});

export const header = (title, { back = true, right = '', sub = '' } = {}) => `
  <header class="bar">
    ${back ? `<button class="icon-btn" data-back aria-label="Voltar">${ICON.back}</button>` : '<span class="sp"></span>'}
    <div class="bar-title"><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ''}</div>
    <div class="bar-right">${right || '<span class="sp"></span>'}</div>
  </header>`;

// ---------- Bottom sheet ----------
export function sheet(html, { onMount, dismissible = true, cls = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg"></div><div class="sheet ${cls}"><div class="grabber"></div>${html}</div>`;
  document.body.appendChild(wrap);
  void wrap.offsetWidth; // força o layout para a transição de entrada
  wrap.classList.add('open');
  const api = {
    el: wrap.querySelector('.sheet'),
    close() {
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 320);
      api.onClose && api.onClose();
    },
  };
  if (dismissible) wrap.querySelector('.sheet-bg').addEventListener('click', () => api.close());
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) api.close(); });
  // arrastar para baixo para fechar
  if (dismissible) {
    const sh = api.el; let y0 = null, dy = 0;
    sh.querySelector('.grabber').addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    sh.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
    sh.addEventListener('touchend', () => { if (y0 == null) return; sh.style.transform = ''; if (dy > 90) api.close(); y0 = null; dy = 0; });
  }
  onMount && onMount(api.el, api);
  afterRender(api.el);
  return api;
}

export function confirmSheet(title, text, okLabel = 'Confirmar', danger = false) {
  return new Promise(res => {
    const s = sheet(`<h3>${title}</h3><p class="muted">${text}</p>
      <div class="row gap"><button class="btn ghost flex" data-r="0">Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'} flex" data-r="1">${okLabel}</button></div>`);
    s.onClose = () => res(false);
    s.el.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; s.onClose = null; s.close(); res(b.dataset.r === '1'); });
  });
}

export function promptSheet(title, { value = '', type = 'text', placeholder = '', inputmode = '', label = 'Salvar' } = {}) {
  return new Promise(res => {
    const s = sheet(`<h3>${title}</h3><input class="field" type="${type}" ${inputmode ? `inputmode="${inputmode}"` : ''} placeholder="${esc(placeholder)}" value="${esc(value)}">
      <div class="row gap"><button class="btn ghost flex" data-close>Cancelar</button><button class="btn primary flex" data-ok>${label}</button></div>`);
    const inp = s.el.querySelector('input');
    setTimeout(() => inp.focus(), 300);
    s.onClose = () => res(null);
    const ok = () => { s.onClose = null; const v = inp.value; s.close(); res(v); };
    s.el.querySelector('[data-ok]').onclick = ok;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
  });
}

// ---------- Toast ----------
export function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  document.body.appendChild(t);
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

// ---------- Confete discreto ----------
export function confetti() {
  if (reduceMotion()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const colors = [cs.getPropertyValue('--accent').trim(), '#ffffff', cs.getPropertyValue('--accent-2').trim(), '#7dd3fc'];
  const N = 90;
  const ps = Array.from({ length: N }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 10 - 4,
    w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  (function f(now) {
    const t = now - t0;
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = Math.max(0, 1 - t / 2600);
    for (const p of ps) {
      p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    if (t < 2600) requestAnimationFrame(f); else c.remove();
  })(t0);
}

// ---------- Imagens ----------
export async function compressImage(file, max = 1400, q = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise(res => cv.toBlob(res, 'image/jpeg', q));
  } finally { URL.revokeObjectURL(url); }
}
// URLs de imagens: cache por chave (id + data) para não criar uma URL nova a cada render
const urlCache = new Map();
export function blobURL(b, key) {
  if (!b) return '';
  if (!key) return URL.createObjectURL(b);
  const hit = urlCache.get(key);
  if (hit && hit.b.size === b.size) return hit.url;
  if (hit) URL.revokeObjectURL(hit.url);
  const url = URL.createObjectURL(b);
  urlCache.set(key, { b, url });
  return url;
}
// Sem o atributo "capture", o iOS oferece Tirar Foto / Fototeca / Arquivos
export function pickImage({ capture = false } = {}) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    if (capture) i.setAttribute('capture', 'environment');
    i.onchange = () => res(i.files[0] || null);
    i.click();
  });
}

// Anima números (contagem) e barras após render
onAfterRender(el => {
  if (reduceMotion() || el.classList.contains('static')) return;
  el.querySelectorAll('[data-count]').forEach(n => {
    const to = parseFloat(n.dataset.count), d = +(n.dataset.dec || 0), t0 = performance.now(), dur = 700;
    (function f(now) {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      n.textContent = fmtNum(to * e, d);
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  });
});

// ---------- Vibração / háptico ----------
// iOS 18+: tocar num <input type=checkbox switch> gera um "tique" do Taptic Engine. Android: Vibration API.
let hapticEl = null, hapticOn = true;
export const setHaptics = on => { hapticOn = on; };
export function haptic(kind = 'light') {
  if (!hapticOn) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(kind === 'heavy' ? [20, 40, 20] : 12); return; }
    if (!hapticEl) {
      hapticEl = document.createElement('label');
      hapticEl.setAttribute('aria-hidden', 'true');
      hapticEl.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      const i = document.createElement('input');
      i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
      hapticEl.appendChild(i);
      document.body.appendChild(hapticEl);
    }
    hapticEl.click();
    if (kind === 'heavy') setTimeout(() => hapticEl.click(), 90);
  } catch (e) {}
}

// ---------- Tema (cor de destaque personalizável) ----------
export const THEMES = {
  lime: { name: 'Limão', accent: '#c6ff3d', rgb: '198,255,61', hi: '#e6ff8f', ink: '#0b0f02', accent2: '#ff8a3d' },
  orange: { name: 'Laranja', accent: '#ff8a3d', rgb: '255,138,61', hi: '#ffc08f', ink: '#1a0b00', accent2: '#c6ff3d' },
  cyan: { name: 'Ciano', accent: '#3de0ff', rgb: '61,224,255', hi: '#a5f3fc', ink: '#001a20', accent2: '#ff8a3d' },
  violet: { name: 'Violeta', accent: '#b18cff', rgb: '177,140,255', hi: '#d9c8ff', ink: '#12062b', accent2: '#3de0ff' },
  red: { name: 'Vermelho', accent: '#ff5a6a', rgb: '255,90,106', hi: '#ffa3ab', ink: '#2a0006', accent2: '#ffc53d' },
  gold: { name: 'Ouro', accent: '#ffc53d', rgb: '255,197,61', hi: '#ffe29a', ink: '#1f1400', accent2: '#3de0ff' },
};
export function applyTheme(key) {
  const t = THEMES[key] || THEMES.lime;
  const r = document.documentElement.style;
  r.setProperty('--accent', t.accent); r.setProperty('--acc-rgb', t.rgb); r.setProperty('--accent-hi', t.hi);
  r.setProperty('--accent-ink', t.ink); r.setProperty('--accent-2', t.accent2);
}
