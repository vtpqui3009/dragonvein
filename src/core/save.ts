/**
 * The save store: one IndexedDB database, one object store (docs/ARCHITECTURE.md §Save, M8a),
 * plus a write-ahead journal in localStorage.
 *
 * This layer knows nothing about worlds. It keeps opaque text under a key and makes the
 * promises the rest of the save relies on:
 *
 * 1. **A write is atomic.** Reading the current record, copying it to a backup and writing
 *    the new one happen in one `readwrite` transaction, resolved on `complete`. A tab closed
 *    or crashed mid-save leaves the previous record whole — never half of the new one.
 * 2. **A write only replaces what its session may replace.** Every record carries `gen`
 *    (bumped per write), the `writer` session that wrote it, and that session's `seq`. A
 *    write is accepted when the stored record is the one its session loaded (same gen,
 *    writer and seq) or one its own session wrote since. Anything else — another tab saved in between — is
 *    refused inside the transaction, so a stale tab cannot overwrite a roster it never saw.
 *    Because a session may replace its own records, it can issue a write the moment it has
 *    something to save: IndexedDB runs `readwrite` transactions on one store in creation
 *    order, so they land in order, and a write older than one already stored is skipped.
 * 3. **The latest save survives an unload, even behind a busy store.** Measured in Chromium
 *    (M8a cycle 2): a transaction still waiting for another tab's `readwrite` transaction
 *    when the page unloads is aborted — a synchronous `put` with `commit()` included — so
 *    the save requested in `pagehide` was lost. `localStorage` writes are synchronous and
 *    survive the unload, so each save is first written to `journal.<writer>`; the next load
 *    takes a journal entry that is newer than the stored record and was written on top of
 *    it (`promotable`), and its first write puts it in IndexedDB.
 *
 * A record that is not a `StoredSave` reports gen -1 and is never written over. Setting a
 * refused record aside (`setAside`) moves it, value for value, to `refused.<n>`; nothing is
 * ever deleted.
 *
 * When IndexedDB is missing, throws on access, errors, or does not open within `timeoutMs`,
 * `openIdbStore` says why instead of throwing, and the game runs without a store. A handle
 * closed under the game (a newer build's `versionchange`, or the browser) is reopened on the
 * next call; if that fails, the error says so. `memoryStore` and `memoryJournal` are the same
 * contracts in memory, for unit tests.
 */

/** What is stored under a key. `text` is the payload; this layer never parses it. */
export interface StoredSave {
  gen: number;
  savedAt: number;
  text: string;
  /** The session that wrote it, and its write counter. Absent on records from before cycle 2. */
  writer?: string;
  seq?: number;
}

export type WriteResult =
  /** Landed, or (`skipped`) a newer write from the same session was already stored. */
  | { ok: true; gen: number; skipped: boolean; putMs: number }
  | { ok: false; gen: number };

export interface WriteRequest {
  text: string;
  /** Wall-clock ms, for display only. */
  savedAt: number;
  /** The record the session loaded: its gen (0 when the slot was empty), writer and seq. */
  base: number;
  baseWriter: string;
  baseSeq: number;
  writer: string;
  /** Increasing per session. */
  seq: number;
  /** When set, a main record this session did not write is copied here first. */
  backupKey?: string;
}

export interface SaveStore {
  readonly kind: 'indexeddb' | 'memory';
  /** The raw value under `key`, or `undefined`. Raw: the caller validates it. */
  get(key: string): Promise<unknown>;
  /** One atomic transaction; see the header. Rejects only on a storage error. */
  write(w: WriteRequest): Promise<WriteResult>;
  /**
   * Move the main record, as stored, to the first free `refused.<n>` and clear main — only
   * if main still reports gen `expectGen` (-1 for a value that is not a StoredSave). One
   * transaction. Resolves the key it was moved to, or null when main had changed.
   */
  setAside(expectGen: number): Promise<string | null>;
  close(): void;
}

export const MAIN_KEY = 'main';
/** Where the record from before a migration is kept: `backup.v1` holds the last schema-1 record. */
export const backupKey = (schema: number): string => `backup.v${schema}`;
export const REFUSED_PREFIX = 'refused.';

export function isStoredSave(v: unknown): v is StoredSave {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return Number.isSafeInteger(r.gen) && (r.gen as number) > 0
    && typeof r.savedAt === 'number' && typeof r.text === 'string'
    && (r.writer === undefined || typeof r.writer === 'string')
    && (r.seq === undefined || Number.isSafeInteger(r.seq));
}

/** 0 when absent; -1 (never replaceable) when not a StoredSave; else its gen. */
export function genOf(current: unknown): number {
  if (current === undefined) return 0;
  return isStoredSave(current) ? current.gen : -1;
}

/** The fingerprint of a record a session loaded: absent is gen 0, writer '' and seq 0. */
export interface BaseRef { base: number; baseWriter: string; baseSeq: number }

export function baseRefOf(current: StoredSave | undefined): BaseRef {
  return current === undefined
    ? { base: 0, baseWriter: '', baseSeq: 0 }
    : { base: current.gen, baseWriter: current.writer ?? '', baseSeq: current.seq ?? 0 };
}

/**
 * Whether `current` is exactly the record `ref` names. Gen alone is not enough: setting a
 * refused record aside empties the slot, so gens start again from 1, and an old reference
 * to "gen 1" must not match a new gen 1 written by someone else.
 */
function isRecord(current: StoredSave | undefined, ref: BaseRef): boolean {
  const r = baseRefOf(current);
  return r.base === ref.base && r.baseWriter === ref.baseWriter && r.baseSeq === ref.baseSeq;
}

type Decision =
  | { put: StoredSave; backup: boolean; result: WriteResult }
  | { put: null; backup: false; result: WriteResult };

/** The acceptance rule, shared by both stores so they cannot drift apart. */
function decide(current: unknown, w: WriteRequest): Decision {
  const found = genOf(current);
  if (found < 0) return { put: null, backup: false, result: { ok: false, gen: -1 } };
  const cur = current as StoredSave | undefined;
  const mine = cur !== undefined && cur.writer === w.writer;
  if (mine && (cur.seq ?? 0) >= w.seq) {
    return { put: null, backup: false, result: { ok: true, gen: found, skipped: true, putMs: 0 } };
  }
  if (!mine && !isRecord(cur, w)) return { put: null, backup: false, result: { ok: false, gen: found } };
  const put: StoredSave = { gen: found + 1, savedAt: w.savedAt, text: w.text, writer: w.writer, seq: w.seq };
  return { put, backup: w.backupKey !== undefined && cur !== undefined && !mine, result: { ok: true, gen: put.gen, skipped: false, putMs: 0 } };
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

function nextRefusedKey(keys: readonly IDBValidKey[] | Iterable<string>): string {
  let n = 0;
  for (const k of keys as Iterable<unknown>) {
    if (typeof k === 'string' && k.startsWith(REFUSED_PREFIX)) {
      const i = Number(k.slice(REFUSED_PREFIX.length));
      if (Number.isSafeInteger(i) && i > n) n = i;
    }
  }
  return `${REFUSED_PREFIX}${n + 1}`;
}

/**
 * The store contract in memory. Values are structured-cloned in and out, as IndexedDB does.
 * Test hooks:
 *   - `beforeCommit` runs after a write is staged and before any of it is applied; throwing
 *     from it is a crash mid-transaction and must leave every key untouched.
 *   - `hold()` queues writes instead of running them, as a store busy with another tab's
 *     transaction does; `release()` runs them in order; `unload()` drops them, as Chromium
 *     aborts a transaction still waiting when its page goes away.
 */
export function memoryStore(opts: { beforeCommit?: () => void } = {}) {
  const data = new Map<string, unknown>();
  let held: (() => void)[] | null = null;
  const run = <T>(op: () => T): Promise<T> => new Promise((resolve, reject) => {
    const go = () => { try { resolve(op()); } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); } };
    if (held) held.push(go); else go();
  });
  const store: SaveStore & {
    data: Map<string, unknown>; hold: () => void; release: () => void; unload: () => number;
  } = {
    kind: 'memory',
    data,
    hold: () => { held ??= []; },
    release: () => { const q = held ?? []; held = null; for (const go of q) go(); },
    unload: () => { const n = held?.length ?? 0; held = null; return n; },
    get: (key) => run(() => structuredClone(data.get(key))),
    write: (w) => run(() => {
      const d = decide(data.get(MAIN_KEY), w);
      if (!d.put) return d.result;
      const staged = new Map<string, unknown>();
      if (d.backup && w.backupKey !== undefined) staged.set(w.backupKey, structuredClone(data.get(MAIN_KEY)));
      staged.set(MAIN_KEY, structuredClone(d.put));
      opts.beforeCommit?.();
      for (const [k, v] of staged) data.set(k, v);
      return d.result;
    }),
    setAside: (expectGen) => run(() => {
      const cur = data.get(MAIN_KEY);
      if (cur === undefined || genOf(cur) !== expectGen) return null;
      const key = nextRefusedKey(data.keys());
      opts.beforeCommit?.();
      data.set(key, cur);
      data.delete(MAIN_KEY);
      return key;
    }),
    close: () => {},
  };
  return store;
}

const DB_NAME = 'dragonvein';
/** The database's own version: the object-store layout, not the save schema. */
const DB_VERSION = 1;
const STORE = 'save';

export type OpenResult = { ok: true; store: SaveStore } | { ok: false; why: string };

const message = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/** Open the database: the handle, or why there is none. Never rejects. */
function openDb(timeoutMs: number): Promise<{ db: IDBDatabase } | { why: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: { db: IDBDatabase } | { why: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => done({ why: `IndexedDB did not open within ${timeoutMs} ms` }), timeoutMs);
    let req: IDBOpenDBRequest;
    try {
      // Reading the property can itself throw (SecurityError in a sandboxed or storage-
      // blocked context), so it is inside the try along with `open`.
      const idb: IDBFactory | undefined = globalThis.indexedDB;
      if (!idb) { done({ why: 'IndexedDB is not available in this browser' }); return; }
      req = idb.open(DB_NAME, DB_VERSION);
    } catch (e) {
      done({ why: `IndexedDB refused to open (${message(e)})` });
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    // Another tab holds an older version open. Not fatal by itself — the open may still
    // succeed when it closes — so only the timeout turns it into "unavailable".
    req.onblocked = () => {};
    req.onerror = () => done({
      why: req.error?.name === 'VersionError'
        ? 'a newer version of the game has upgraded the save database'
        : `IndexedDB failed to open (${message(req.error)})`,
    });
    req.onsuccess = () => {
      const db = req.result;
      if (settled) { db.close(); return; }   // gave up waiting; do not leak the connection
      done({ db });
    };
  });
}

/** Open the save database, or say why it cannot be. Never rejects. */
export async function openIdbStore(timeoutMs = 4000): Promise<OpenResult> {
  const r = await openDb(timeoutMs);
  return 'db' in r ? { ok: true, store: idbStore(r.db, timeoutMs) } : { ok: false, why: r.why };
}

/** Raised when the handle was closed under the game and could not be opened again. */
export class StoreClosedError extends Error {
  constructor(why: string) {
    super(`storage was closed and could not be reopened: ${why}`);
    this.name = 'StoreClosedError';
  }
}

function idbStore(first: IDBDatabase, timeoutMs: number): SaveStore {
  let db: IDBDatabase | null = null;
  let reopening: Promise<IDBDatabase> | null = null;
  const adopt = (d: IDBDatabase) => {
    db = d;
    // A newer build asking to upgrade must not be blocked by this tab: close, and reopen on
    // the next call (which fails honestly if the upgrade made this build's version too old).
    d.onversionchange = () => { d.close(); if (db === d) db = null; };
    // The browser closed it (storage cleared, disk error): reopen on the next call.
    d.onclose = () => { if (db === d) db = null; };
  };
  adopt(first);
  const handle = (): Promise<IDBDatabase> => {
    if (db) return Promise.resolve(db);
    reopening ??= openDb(timeoutMs).then((r) => {
      reopening = null;
      if ('why' in r) throw new StoreClosedError(r.why);
      adopt(r.db);
      return r.db;
    });
    return reopening;
  };
  /** Run `body` in one transaction; resolve its result on `complete`. */
  const tx = <T>(mode: IDBTransactionMode, body: (os: IDBObjectStore, set: (v: T) => void) => void) =>
    handle().then((d) => new Promise<T>((resolve, reject) => {
      let result: T | undefined;
      let t: IDBTransaction;
      try {
        t = d.transaction(STORE, mode);
      } catch (e) {
        // InvalidStateError: closed between `handle()` and here. Drop it; the next call reopens.
        if (db === d) db = null;
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      body(t.objectStore(STORE), (v) => { result = v; });
      t.oncomplete = () => resolve(result as T);
      t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
    }));

  return {
    kind: 'indexeddb',
    get: (key) => tx<unknown>('readonly', (os, set) => {
      const r = os.get(key);
      r.onsuccess = () => set(r.result as unknown);
    }),
    write: (w) => tx<WriteResult>('readwrite', (os, set) => {
      const cur = os.get(MAIN_KEY);
      cur.onsuccess = () => {
        const current = cur.result as unknown;
        const d = decide(current, w);
        if (d.put) {
          const t0 = now();
          if (d.backup && w.backupKey !== undefined) os.put(current, w.backupKey);
          os.put(d.put, MAIN_KEY);
          // The structured clone of the record happens inside `put`, on this thread.
          if (d.result.ok) d.result.putMs = now() - t0;
        }
        set(d.result);
      };
    }),
    setAside: (expectGen) => tx<string | null>('readwrite', (os, set) => {
      const cur = os.get(MAIN_KEY);
      cur.onsuccess = () => {
        const current = cur.result as unknown;
        if (current === undefined || genOf(current) !== expectGen) { set(null); return; }
        const keys = os.getAllKeys();
        keys.onsuccess = () => {
          const key = nextRefusedKey(keys.result);
          os.put(current, key);
          os.delete(MAIN_KEY);
          set(key);
        };
      };
    }),
    close: () => { db?.close(); db = null; },
  };
}

// --- the write-ahead journal ------------------------------------------------------------

/** One session's latest save, written before its IndexedDB write is even issued. */
export interface JournalEntry extends BaseRef {
  writer: string;
  seq: number;
  savedAt: number;
  text: string;
}

export interface Journal {
  /** Every entry, unparseable ones skipped. */
  read(): JournalEntry[];
  /** Synchronous. False when the entry could not be written (quota, storage blocked). */
  write(e: JournalEntry): boolean;
  remove(writer: string): void;
}

export const JOURNAL_PREFIX = 'dragonvein.journal.';

export function isJournalEntry(v: unknown): v is JournalEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.writer === 'string' && Number.isSafeInteger(e.base) && Number.isSafeInteger(e.seq)
    && typeof e.baseWriter === 'string' && Number.isSafeInteger(e.baseSeq)
    && typeof e.savedAt === 'number' && typeof e.text === 'string';
}

/**
 * Whether journal entry `e` may replace `main`: written on top of exactly this record — the
 * one its session loaded, or a later one its session wrote — and newer than it.
 */
export function promotable(e: JournalEntry, main: unknown): boolean {
  const found = genOf(main);
  if (found < 0) return false;
  const cur = main as StoredSave | undefined;
  if (cur !== undefined && cur.writer === e.writer) return (cur.seq ?? 0) < e.seq;
  return isRecord(cur, e);
}

/** The journal in `localStorage`, or null when it cannot be used. */
export function localJournal(): Journal | null {
  let ls: Storage;
  try {
    ls = globalThis.localStorage;
    if (!ls) return null;
    ls.getItem(JOURNAL_PREFIX);   // throws where storage is blocked
  } catch {
    return null;
  }
  return {
    read: () => {
      const out: JournalEntry[] = [];
      try {
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (!k?.startsWith(JOURNAL_PREFIX)) continue;
          try {
            const v: unknown = JSON.parse(ls.getItem(k) ?? 'null');
            if (isJournalEntry(v)) out.push(v);
          } catch { /* an unparseable entry is skipped, and left where it is */ }
        }
      } catch { /* storage went away */ }
      return out;
    },
    write: (e) => {
      try {
        ls.setItem(JOURNAL_PREFIX + e.writer, JSON.stringify(e));
        return true;
      } catch {
        return false;
      }
    },
    remove: (writer) => { try { ls.removeItem(JOURNAL_PREFIX + writer); } catch { /* nothing to do */ } },
  };
}

/** The journal in memory, for tests. Entries are copied in and out, as localStorage does. */
export function memoryJournal() {
  const entries = new Map<string, string>();
  const j: Journal & { entries: Map<string, string> } = {
    entries,
    read: () => [...entries.values()].map((s) => JSON.parse(s) as JournalEntry),
    write: (e) => { entries.set(e.writer, JSON.stringify(e)); return true; },
    remove: (writer) => { entries.delete(writer); },
  };
  return j;
}
