// IndexedDB: armazenamento local de tudo (histórico, fotos, dieta, configurações).
const DB_NAME = 'shape2026';
const DB_VERSION = 1;
export const STORES = ['sessions', 'weights', 'days', 'photos', 'media', 'measures', 'kv'];

let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    fn(t.objectStore(store));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  async get(store, id) {
    const d = await open();
    return reqP(d.transaction(store).objectStore(store).get(id));
  },
  async all(store) {
    const d = await open();
    return reqP(d.transaction(store).objectStore(store).getAll());
  },
  put(store, value) { return tx(store, 'readwrite', s => { s.put(value); }); },
  del(store, id) { return tx(store, 'readwrite', s => { s.delete(id); }); },
  clear(store) { return tx(store, 'readwrite', s => { s.clear(); }); },
};

// Chave/valor (configurações, perfil, sessão ativa...)
export const kv = {
  async get(key, fallback = null) {
    const r = await db.get('kv', key);
    return r ? r.value : fallback;
  },
  set(key, value) { return db.put('kv', { key, value }); },
  del(key) { return db.del('kv', key); },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Backup ----------
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const dataURLToBlob = async u => (await fetch(u)).blob();

async function encode(v) {
  if (v instanceof Blob) return { __blob: await blobToDataURL(v) };
  if (Array.isArray(v)) return Promise.all(v.map(encode));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = await encode(v[k]);
    return o;
  }
  return v;
}
async function decode(v) {
  if (v && typeof v === 'object' && v.__blob) return dataURLToBlob(v.__blob);
  if (Array.isArray(v)) return Promise.all(v.map(decode));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = await decode(v[k]);
    return o;
  }
  return v;
}

export async function exportBackup() {
  const out = { app: 'shape2026', version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const s of STORES) out.data[s] = await encode(await db.all(s));
  return out;
}

export async function importBackup(json) {
  if (!json || json.app !== 'shape2026' || !json.data) throw new Error('Arquivo de backup inválido');
  for (const s of STORES) {
    if (!json.data[s]) continue;
    await db.clear(s);
    for (const item of json.data[s]) await db.put(s, await decode(item));
  }
}

export async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}
