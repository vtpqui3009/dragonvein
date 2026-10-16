/**
 * The save store: one IndexedDB database, one object store (docs/ARCHITECTURE.md §Save, M8a).
 *
 * This layer knows nothing about worlds. It keeps opaque text under a key, with a write
 * generation and a wall-clock stamp, and it makes two promises the rest of the save relies on:
 *
 * 1. **A write is atomic.** Reading the current record, copying it to a backup and writing
 *    the new one happen in one `readwrite` transaction. IndexedDB commits a transaction
 *    whole or not at all, so a tab closed, reloaded or crashed mid-save leaves the previous
 *    record exactly as it was — never half of the new one.
 * 2. **A write only replaces the record its writer last saw.** Every record carries `gen`,
 *    bumped by one per write. A writer passes the `gen` it loaded (0 for "there was none");
 *    if the stored record has moved on — another tab saved in between — nothing is written
 *    and the write reports the conflict. Two tabs therefore cannot silently overwrite each
 *    other: the first to write keeps the slot, and the other is told it is stale. The check
 *    and the put share the transaction, so no third write can land between them.
 *
 * A record that is not a `StoredSave` at all also fails the check, so a slot holding
 * something this build cannot read is never written over.
 *
 * When IndexedDB is missing, throws on access (private modes, sandboxed frames), errors, or
 * does not open within `timeoutMs`, `openIdbStore` says why instead of throwing, and the game
 * runs without a store. `memoryStore` is the same contract in a Map, for unit tests.
 */

/** What is stored under a key. `text` is the payload; this layer never parses it. */
export interface StoredSave {
  gen: number;
  savedAt: number;
  text: string;
}

export type WriteResult = { ok: true; gen: number } | { ok: false; gen: number };

export interface WriteRequest {
  text: string;
  /** Wall-clock ms, for display only. */
  savedAt: number;
  /** The `gen` this writer last loaded or wrote; 0 when the slot was empty. */
  expectGen: number;
  /** When set, the current main record is copied here in the same transaction first. */
  backupKey?: string;
}

export interface SaveStore {
  readonly kind: 'indexeddb' | 'memory';
  /** The raw value under `key`, or `undefined`. Raw: the caller validates it. */
  get(key: string): Promise<unknown>;
  /**
   * One atomic transaction: if the main record's gen is `expectGen` (0 = absent), copy it
   * to `backupKey` when one is given, then write `{ gen: expectGen + 1, savedAt, text }`
   * as main. Otherwise write nothing and resolve `{ ok: false, gen: <found> }`. A slot
   * holding something that is not a StoredSave reports gen -1 and no `expectGen` replaces
   * it, -1 included. Rejects only on a storage error, in which case nothing was written.
   */
  write(w: WriteRequest): Promise<WriteResult>;
  close(): void;
}

export const MAIN_KEY = 'main';
/** Where the record from before a migration is kept: `backup.v1` holds the last schema-1 record. */
export const backupKey = (schema: number): string => `backup.v${schema}`;

export function isStoredSave(v: unknown): v is StoredSave {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return Number.isSafeInteger(r.gen) && (r.gen as number) > 0
    && typeof r.savedAt === 'number' && typeof r.text === 'string';
}

/** The gen a write must expect to replace `current`: 0 when absent; -1 (never replaceable) when unreadable. */
function genOf(current: unknown): number {
  if (current === undefined) return 0;
  return isStoredSave(current) ? current.gen : -1;
}

/**
 * The store contract in memory. Values are structured-cloned in and out, as IndexedDB does.
 * `beforeCommit`, a test hook, runs after a write has been staged and before any of it is
 * applied; throwing from it is a crash mid-transaction, and must leave every key untouched.
 */
export function memoryStore(opts: { beforeCommit?: () => void } = {}): SaveStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    kind: 'memory',
    data,
    get: (key) => Promise.resolve(structuredClone(data.get(key))),
    write: (w) => {
      const current = data.get(MAIN_KEY);
      const found = genOf(current);
      if (found < 0 || found !== w.expectGen) return Promise.resolve({ ok: false, gen: found });
      const staged = new Map<string, unknown>();
      if (w.backupKey !== undefined && current !== undefined) staged.set(w.backupKey, structuredClone(current));
      const next: StoredSave = { gen: w.expectGen + 1, savedAt: w.savedAt, text: w.text };
      staged.set(MAIN_KEY, next);
      try {
        opts.beforeCommit?.();
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
      for (const [k, v] of staged) data.set(k, v);
      return Promise.resolve({ ok: true, gen: next.gen });
    },
    close: () => {},
  };
}

const DB_NAME = 'dragonvein';
/** The database's own version: the object-store layout, not the save schema. */
const DB_VERSION = 1;
const STORE = 'save';

export type OpenResult = { ok: true; store: SaveStore } | { ok: false; why: string };

const message = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/** Open the save database, or say why it cannot be. Never rejects. */
export function openIdbStore(timeoutMs = 4000): Promise<OpenResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: OpenResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, why: `IndexedDB did not open within ${timeoutMs} ms` }), timeoutMs);
    let req: IDBOpenDBRequest;
    try {
      // Reading the property can itself throw (SecurityError in a sandboxed or storage-
      // blocked context), so it is inside the try along with `open`.
      const idb: IDBFactory | undefined = globalThis.indexedDB;
      if (!idb) { done({ ok: false, why: 'IndexedDB is not available in this browser' }); return; }
      req = idb.open(DB_NAME, DB_VERSION);
    } catch (e) {
      done({ ok: false, why: `IndexedDB refused to open (${message(e)})` });
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    // Another tab holds an older version open. Not fatal by itself — the open may still
    // succeed when it closes — so only the timeout above turns it into "unavailable".
    req.onblocked = () => {};
    req.onerror = () => done({ ok: false, why: `IndexedDB failed to open (${message(req.error)})` });
    req.onsuccess = () => {
      const db = req.result;
      if (settled) { db.close(); return; }   // gave up waiting; do not leak the connection
      // A newer build asking to upgrade must not be blocked by this tab. Once closed, this
      // tab's writes fail and its HUD says so, which is the truth.
      db.onversionchange = () => db.close();
      done({ ok: true, store: idbStore(db) });
    };
  });
}

function idbStore(db: IDBDatabase): SaveStore {
  return {
    kind: 'indexeddb',
    get: (key) => new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result as unknown);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB read aborted'));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }),
    write: (w) => new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        let result: WriteResult = { ok: false, gen: -1 };
        const cur = os.get(MAIN_KEY);
        cur.onsuccess = () => {
          const current = cur.result as unknown;
          const found = genOf(current);
          if (found < 0 || found !== w.expectGen) { result = { ok: false, gen: found }; return; }
          if (w.backupKey !== undefined && current !== undefined) os.put(current, w.backupKey);
          const next: StoredSave = { gen: w.expectGen + 1, savedAt: w.savedAt, text: w.text };
          os.put(next, MAIN_KEY);
          result = { ok: true, gen: next.gen };
        };
        // Resolved on `complete`, not on the put's success: only then is the write durable,
        // and only then is it true that the whole transaction landed.
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }),
    close: () => db.close(),
  };
}
