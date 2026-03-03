// ============================================================
// FlowType — Auto-save to IndexedDB
// Transparent persistence — "saving" doesn't exist for the user
// ============================================================

const DB_NAME = "flowtype";
const DB_VERSION = 1;
const STORE_NAME = "documents";
const DOC_KEY = "main";

interface DocRecord {
  id: string;
  content: string;
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDocument(content: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: DocRecord = {
      id: DOC_KEY,
      content,
      updatedAt: Date.now(),
    };
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function loadDocument(): Promise<string> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(DOC_KEY);
    request.onsuccess = () => {
      const record = request.result as DocRecord | undefined;
      resolve(record?.content ?? "");
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

// Debounced save helper
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(content: string, delayMs: number = 300): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDocument(content).catch(console.error);
  }, delayMs);
}
