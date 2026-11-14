const DB_NAME = 'AureliaCinemaLocalDB';
const DB_VERSION = 1;
const VIDEO_STORE = 'videos';
const SESSION_STORE = 'session';

export interface StoredVideoRecord {
  id: string;
  file: Blob;
  fileName: string;
  fileSize: number;
  mimeType: string;
  duration: number;
  width: number;
  height: number;
  thumbnailUrl: string | null;
  orderIndex: number;
  label?: string;
}

export interface StoredSessionRecord {
  key: 'active';
  theaterId: string | null;
  seatId: string | null;
  videoMode: 'without_ads' | 'with_ads';
  playlistIds: string[];
}

function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Unable to open browser IndexedDB storage.'));
  });
}

export async function saveVideoToIndexedDb(record: StoredVideoRecord): Promise<boolean> {
  try {
    const db = await openDatabase();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, 'readwrite');
      const store = tx.objectStore(VIDEO_STORE);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Failed to store video in IndexedDB.'));
      };
    });
  } catch {
    return false;
  }
}

export async function deleteVideoFromIndexedDb(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(VIDEO_STORE, 'readwrite');
      tx.objectStore(VIDEO_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Graceful no-op when IDB unavailable
  }
}

export async function clearAllVideosFromIndexedDb(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([VIDEO_STORE, SESSION_STORE], 'readwrite');
      tx.objectStore(VIDEO_STORE).clear();
      tx.objectStore(SESSION_STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Graceful no-op
  }
}

export async function saveSessionToIndexedDb(session: Omit<StoredSessionRecord, 'key'>): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(SESSION_STORE, 'readwrite');
      tx.objectStore(SESSION_STORE).put({ key: 'active', ...session });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Graceful no-op
  }
}

export async function loadSessionFromIndexedDb(): Promise<{
  session: StoredSessionRecord | null;
  videos: StoredVideoRecord[];
  available: boolean;
}> {
  if (!isIndexedDbSupported()) {
    return { session: null, videos: [], available: false };
  }
  try {
    const db = await openDatabase();
    const session = await new Promise<StoredSessionRecord | null>((resolve) => {
      const tx = db.transaction(SESSION_STORE, 'readonly');
      const req = tx.objectStore(SESSION_STORE).get('active');
      req.onsuccess = () => resolve((req.result as StoredSessionRecord) || null);
      req.onerror = () => resolve(null);
    });

    const videos = await new Promise<StoredVideoRecord[]>((resolve) => {
      const tx = db.transaction(VIDEO_STORE, 'readonly');
      const req = tx.objectStore(VIDEO_STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredVideoRecord[]) || []);
      req.onerror = () => resolve([]);
    });

    db.close();
    return { session, videos, available: true };
  } catch {
    return { session: null, videos: [], available: false };
  }
}
