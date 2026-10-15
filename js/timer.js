// Timer de descanso (baseado em Date.now()), Wake Lock, beep (Web Audio) e flash.
import { kv } from './db.js';

// ---------- Áudio ----------
let ctx;
// Safari 17+: "transient" = som curto que abaixa a música (Spotify etc.) por um instante em vez de pausá-la
function audioSessionTransient() {
  try { if (navigator.audioSession && navigator.audioSession.type !== 'transient') navigator.audioSession.type = 'transient'; } catch (e) {}
}
export function unlockAudio() {
  audioSessionTransient();
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    // buffer silencioso destrava o áudio no iOS
    const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch (e) {}
  // a voz também precisa ser "destravada" por um toque no iOS
  try { if (!voiceUnlocked && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); voiceUnlocked = true; } } catch (e) {}
}
let voiceUnlocked = false;
export async function beep({ freq = 880, dur = 0.18, count = 1, gap = 0.12 } = {}) {
  const st = Object.assign({ sound: true, volume: 0.6 }, await kv.get('settings', {}));
  if (!st.sound) return;
  try {
    unlockAudio();
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < count; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      const t = t0 + i * (dur + gap);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.01, st.volume), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    }
  } catch (e) {}
}

// Voz (opcional, em Perfil): anuncia o fim do descanso e a próxima série
export async function speak(text) {
  const st = Object.assign({ voice: false, sound: true }, await kv.get('settings', {}));
  if (!st.voice || !st.sound || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR'; u.rate = 1.05;
    const v = speechSynthesis.getVoices().find(x => x.lang && x.lang.toLowerCase().startsWith('pt-br'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}

export function flash(kind = 'done') {
  const el = document.getElementById('flash');
  el.className = '';
  void el.offsetWidth;
  el.className = kind === 'warn' ? 'warn' : 'on';
}

// ---------- Wake Lock ----------
let lock = null, wantLock = false;
export async function keepAwake(on) {
  wantLock = on;
  try {
    if (on && 'wakeLock' in navigator && !lock && document.visibilityState === 'visible') {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch (e) { lock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (wantLock) keepAwake(true);
  try { if (ctx && ctx.state !== 'running') ctx.resume(); } catch (e) {}
});

// ---------- Contagem regressiva genérica ----------
// O tempo restante é sempre endAt - Date.now(): continua correto se a tela bloquear ou o app for para o fundo.
export class Countdown {
  constructor({ endAt, duration, onTick, onWarn, onDone, warnAt = 10 }) {
    this.duration = duration; this.endAt = endAt || Date.now() + duration * 1000;
    this.onTick = onTick; this.onWarn = onWarn; this.onDone = onDone; this.warnAt = warnAt;
    this.warned = this.remaining() <= warnAt; this.done = false;
    this.paused = null;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.iv = setInterval(this.loop, 500); // rAF pausa em segundo plano
  }
  remaining() { return Math.max(0, (this.paused != null ? this.paused : this.endAt - Date.now()) / 1000); }
  add(sec) {
    this.endAt += sec * 1000; this.duration = Math.max(1, this.duration + sec);
    if (this.remaining() > this.warnAt) this.warned = false;
    this.loop();
  }
  pause() { if (this.paused == null) { this.paused = this.endAt - Date.now(); } }
  resume() { if (this.paused != null) { this.endAt = Date.now() + this.paused; this.paused = null; this.loop(); } }
  loop() {
    if (this.done) return;
    const r = this.remaining();
    this.onTick && this.onTick(r, this.duration);
    if (!this.warned && r <= this.warnAt && r > 0) { this.warned = true; this.onWarn && this.onWarn(); }
    if (r <= 0 && this.paused == null) { this.done = true; this.stop(); this.onDone && this.onDone(); return; }
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }
  stop() { cancelAnimationFrame(this.raf); clearInterval(this.iv); }
}

export const mmss = s => { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// nunca negativo, mesmo se o relógio do aparelho mudar
export const hhmmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
