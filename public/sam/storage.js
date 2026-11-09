const LEGACY_KEY = 'draw-fighters-v1';
const DB_NAME = 'draw-fighters';
const STORE = 'projects';
const KEY = 'current';

function database() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB is unavailable'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadProject() {
  try {
    const db = await database();
    const value = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (value && typeof value === 'object') return value;
  } catch { /* use the earlier local save */ }
  try { return JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}'); } catch { return {}; }
}

export async function saveProject(value) {
  let db;
  try { db = await database(); }
  catch { localStorage.setItem(LEGACY_KEY, JSON.stringify(value)); return; }
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(value, KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
