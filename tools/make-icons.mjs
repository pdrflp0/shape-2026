// Gera os ícones PNG do app (sem dependências): node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [7, 8, 10], ACC = [198, 255, 61];
// formas em coordenadas 0..1: retângulos arredondados [cx, cy, halfW, halfH, radius]
const shapes = [
  [0.5, 0.5, 0.24, 0.035, 0.02],     // barra
  [0.30, 0.5, 0.045, 0.2, 0.03],     // anilhas internas
  [0.70, 0.5, 0.045, 0.2, 0.03],
  [0.215, 0.5, 0.035, 0.13, 0.025],  // anilhas externas
  [0.785, 0.5, 0.035, 0.13, 0.025],
];
const sd = (x, y, [cx, cy, hw, hh, r]) => {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

function render(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      // brilho radial sutil no fundo
      const g = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.42) / 0.62) ** 2 * 0.16;
      let c = BG.map((b, i) => b + (ACC[i] - b) * g);
      const d = Math.min(...shapes.map(s => sd(u, v, s)));
      const a = Math.min(1, Math.max(0, 0.5 - d * size));
      c = c.map((b, i) => Math.round(b + (ACC[i] - b) * a));
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  return png(size, size, raw);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Tela de abertura do iOS: fundo escuro liso + logo (quadrado limão com o haltere escuro)
function renderSplash(W, H) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  const L = Math.round(Math.min(W, H) * 0.24), lx = (W - L) / 2, ly = H * 0.44 - L / 2, lr = L * 0.23;
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    const inRow = y >= ly - 2 && y <= ly + L + 2;
    for (let x = 0; x < W; x++) {
      let c = BG;
      if (inRow && x >= lx - 2 && x <= lx + L + 2) {
        const px = x + 0.5, py = y + 0.5;
        const box = sd(px, py, [lx + L / 2, ly + L / 2, L / 2, L / 2, lr]);
        const a = Math.min(1, Math.max(0, 0.5 - box));
        if (a > 0) {
          const u = (px - lx) / L, v = (py - ly) / L;
          const d = Math.min(...shapes.map(sh => sd(u, v, sh))) * L;
          const b = Math.min(1, Math.max(0, 0.5 - d));
          const logo = ACC.map((k, i) => k + (BG[i] - k) * b);
          c = BG.map((k, i) => Math.round(k + (logo[i] - k) * a));
        }
      }
      const o = y * (W * 4 + 1) + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  return png(W, H, raw);
}
// [largura CSS, altura CSS, densidade] dos iPhones (portrait)
export const SPLASH = [
  [440, 956, 3], [402, 874, 3], [420, 912, 3], [430, 932, 3], [393, 852, 3],
  [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 2], [375, 667, 2],
];

const out = new URL('../icons/', import.meta.url);
for (const s of [180, 192, 512]) writeFileSync(new URL(`icon-${s}.png`, out), render(s));
writeFileSync(new URL('icon.svg', out), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#07080a"/>${shapes.map(([cx, cy, hw, hh, r]) => `<rect x="${(cx - hw) * 100}" y="${(cy - hh) * 100}" width="${hw * 200}" height="${hh * 200}" rx="${r * 100}" fill="#c6ff3d"/>`).join('')}</svg>`);
for (const [w, h, r] of SPLASH) writeFileSync(new URL(`splash-${w * r}x${h * r}.png`, out), renderSplash(w * r, h * r));
console.log('ícones e telas de abertura gerados');
console.log(SPLASH.map(([w, h, r]) => `  <link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" href="icons/splash-${w * r}x${h * r}.png">`).join('\n'));
