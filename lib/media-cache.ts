/** Browser IndexedDB cache for uploaded video/image blobs (survives reload; not cross-device). */

const DB_NAME = 'slush-media-cache';
const STORE = 'files';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function cacheMediaBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    tx.objectStore(STORE).put(blob, id);
  });
  db.close();
}

export async function readMediaBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    tx.onerror = () => reject(tx.error || new Error('IndexedDB read failed'));
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) || null);
  });
  db.close();
  return blob;
}

export async function revokeIfBlob(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}
