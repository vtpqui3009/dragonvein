/**
 * Loading a world and keeping it saved (M8a): the policy over src/core/save.ts.
 *
 * No clock, no DOM: the caller passes wall-clock stamps in (and, for timing only, a
 * monotonic clock), so this runs under vitest against `memoryStore` exactly as it runs in
 * the page against IndexedDB.
 *
 * The rules, each of which `tests/save.test.ts` exercises:
 *   - **Load never blocks play.** No store, an unreadable store, or a refused record all
 *     still yield a world — a fresh one — and a session that says why it is not saving.
 *   - **A refused record is never written over.** A `newer`, `corrupt` or `incomplete` main
 *     record leaves the session unwritable — until the player chooses `setAside`, which
 *     moves the record, as stored, to `refused.<n>` (never deleted) and lets the session
 *     save a new world. The genomes in it that still validate are offered back (`salvage`).
 *   - **A migrated record is backed up before its first write.** The write that first
 *     replaces a schema-N < current record copies it to `backup.vN` in the same transaction.
 *   - **A session only replaces what it loaded, or what it wrote since.** Another tab's write
 *     in between makes the store refuse, and this session stops (`conflict`) instead of
 *     overwriting a roster it has never seen.
 *   - **Every save is issued at once and journalled first.** A save writes the journal
 *     synchronously, then issues its IndexedDB write straight away — no waiting for the one
 *     in flight. A page that unloads before its writes run (Chromium aborts them) leaves the
 *     journal entry, and the next load promotes it. Writes land in order; a write older than
 *     one already stored is skipped by the store.
 */
import type { GenomeJson } from '../core/genome';
import {
  MAIN_KEY, backupKey, baseRefOf, genOf, isStoredSave, promotable,
  type BaseRef, type Journal, type SaveStore, type StoredSave,
} from '../core/save';
import { CHAIN, decodeSave, encodeSave, salvageGenomes, type Chain, type Refusal } from './migrate';
import { createWorld, type World } from './world';

export type SaveState =
  /** Writable; nothing landed in this session yet. */
  | 'pending'
  /** The latest write landed; see `lastSavedAt`. */
  | 'saved'
  /** The latest write failed with a storage error. The next save retries (and reopens). */
  | 'error'
  /** No store: IndexedDB is missing, blocked or failed to open or read. */
  | 'unavailable'
  /** Another tab wrote after this one loaded. This session no longer saves. */
  | 'conflict'
  /** The stored record was refused; it is kept, and never written over. */
  | Refusal;

export interface LoadReport {
  /** Where the world came from. `journal`: a save that had not reached IndexedDB. */
  source: 'fresh' | 'loaded' | 'journal' | 'refused';
  /** The schema the record was stored at, when one was read. */
  fromSchema: number | null;
  /** The gen of the record read, 0 when there was none. */
  gen: number;
  detail: string;
}

/** What one save cost. `serialiseMs` and `journalMs` are synchronous main-thread time. */
export interface SaveTiming {
  serialiseMs: number;
  journalMs: number;
  /** The structured clone inside IndexedDB `put`, also on the main thread. */
  putMs: number;
  /** Request to the write's `complete`. */
  roundTripMs: number;
  bytes: number;
}

interface SessionInit {
  state: SaveState;
  detail: string;
  base: number;
  /** The rest of the loaded record's fingerprint; '' and 0 for an empty slot. */
  baseWriter?: string;
  baseSeq?: number;
  writer: string;
  journal?: Journal | null;
  backup?: string;
  refused?: { gen: number; raw: unknown; salvage: GenomeJson[] };
  /** Journal entries read at load, removed once this session's first write lands. */
  sweep?: string[];
  clock?: () => number;
}

export class SaveSession {
  state: SaveState;
  detail: string;
  /** The gen this session loaded (0 for none); its writes replace this or its own records. */
  base: number;
  /** The gen of this session's latest landed write, else `base`. */
  gen: number;
  readonly writer: string;
  private baseWriter: string;
  private baseSeq: number;
  /** Wall-clock ms of the latest landed write, or null. */
  lastSavedAt: number | null = null;
  /** Writes that landed in this session. */
  writes = 0;
  /** Writes issued and not yet answered. */
  inflight = 0;
  lastTiming: SaveTiming | null = null;
  /** The refused record, as read, and the genomes in it that still validate. */
  refused: { gen: number; raw: unknown; salvage: GenomeJson[] } | null;
  /** Where `setAside` put the refused record. */
  asideKey: string | null = null;
  /** True once `setAside` was refused because the stored save changed: reload to see it. */
  asideRefused = false;
  /** A one-line account of something the session did on its own (re-saving an emptied slot). */
  notice = '';
  /** False when the journal is missing, or its latest write failed (blocked or full). */
  journalOk: boolean;
  private seq = 0;
  private landedSeq = 0;
  private journaledSeq = 0;
  private backup: string | undefined;
  private sweep: string[];
  private readonly journal: Journal | null;
  private readonly clock: () => number;

  constructor(private readonly store: SaveStore | null, init: SessionInit) {
    this.state = init.state;
    this.detail = init.detail;
    this.base = init.base;
    this.gen = init.base;
    this.baseWriter = init.baseWriter ?? '';
    this.baseSeq = init.baseSeq ?? 0;
    this.writer = init.writer;
    this.journal = init.journal ?? null;
    this.backup = init.backup;
    this.refused = init.refused ?? null;
    this.sweep = init.sweep ?? [];
    this.clock = init.clock ?? (() => 0);
    this.journalOk = this.journal !== null;
  }

  /**
   * Whether the newest save this session asked for is durable — landed in IndexedDB, or in
   * the journal. "saved" on screen means this, and nothing less (M8a cycle 2, D4).
   */
  get durable(): boolean {
    return this.landedSeq >= this.seq || this.journaledSeq >= this.seq;
  }

  /** False while the session must not write: no store, a refused record, or a conflict. */
  get writable(): boolean {
    return this.store !== null && (this.state === 'pending' || this.state === 'saved' || this.state === 'error');
  }

  /**
   * Serialise `world` now, journal it, and issue its write at once. Resolves when the store
   * has answered for this write. Never rejects.
   */
  save(world: object, now: number): Promise<void> {
    if (!this.writable || !this.store) return Promise.resolve();
    const t0 = this.clock();
    const text = encodeSave(world);
    return this.issue(text, now, ++this.seq, t0, this.clock());
  }

  private issue(text: string, now: number, seq: number, t0: number, t1: number): Promise<void> {
    const store = this.store;
    if (!this.writable || !store) return Promise.resolve();
    const ref: BaseRef = { base: this.base, baseWriter: this.baseWriter, baseSeq: this.baseSeq };
    if (this.journal) {
      const ok = this.journal.write({ ...ref, writer: this.writer, seq, savedAt: now, text });
      this.journalOk = ok;
      if (ok && seq > this.journaledSeq) this.journaledSeq = seq;
    }
    const t2 = this.clock();
    this.inflight++;
    return store.write({
      ...ref, text, savedAt: now, writer: this.writer, seq, landed: this.landedSeq > 0,
      ...(this.backup !== undefined ? { backupKey: this.backup } : {}),
    }).then((r) => {
      this.lastTiming = {
        serialiseMs: t1 - t0, journalMs: t2 - t1, putMs: r.ok ? r.putMs : 0,
        roundTripMs: this.clock() - t0, bytes: text.length,
      };
      if (!r.ok && r.emptied && this.writable) {
        // The record this session loaded is gone and the slot is empty: the database was
        // deleted or cleared under the tab. Nothing can be overwritten, so start again on the
        // empty slot and write this world there (M8a cycle 2, D6).
        if (this.base !== 0 || this.baseWriter !== '' || this.baseSeq !== 0 || this.landedSeq > 0) {
          this.base = 0;
          this.baseWriter = '';
          this.baseSeq = 0;
          this.gen = 0;
          this.landedSeq = 0;
          this.notice = 'the save storage was emptied under this tab (cleared or deleted) — saved again from this tab';
        }
        return this.issue(text, now, seq, t0, t1);
      }
      if (!r.ok) {
        this.state = 'conflict';
        this.detail = r.gen < 0
          ? 'the stored record changed into something unreadable; not overwritten'
          : `another tab saved (gen ${r.gen}, this tab had ${this.gen})`;
        return;
      }
      if (!r.skipped) this.writes++;
      if (seq <= this.landedSeq || this.state === 'conflict') return;
      this.landedSeq = seq;
      this.gen = r.gen;
      this.backup = undefined;
      this.state = 'saved';
      this.detail = '';
      this.lastSavedAt = now;
      if (this.journal) {
        if (this.landedSeq >= this.journaledSeq) this.journal.remove(this.writer);
        for (const w of this.sweep) if (w !== this.writer) this.journal.remove(w);
      }
      this.sweep = [];
    }, (e: unknown) => {
      if (seq > this.landedSeq && this.writable) {
        this.state = 'error';
        this.detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      }
    }).finally(() => { this.inflight--; });
  }

  /** Another tab announced a write past ours: stop now, before our next save is refused. */
  markStale(gen: number): void {
    if (gen > this.gen && this.writable) {
      this.state = 'conflict';
      this.detail = `another tab saved (gen ${gen}, this tab had ${this.gen})`;
    }
  }

  /**
   * The player's way out of a refused record: move it, as stored, to `refused.<n>` and make
   * this session writable on an empty slot. Nothing is deleted. Resolves the key, or null
   * (with `detail` saying why) when there was nothing to move or the slot had changed.
   */
  async setAside(): Promise<string | null> {
    const r = this.refused;
    if (!r || !this.store) return null;
    let key: string | null;
    try {
      key = await this.store.setAside(r.raw);
    } catch (e) {
      this.detail = `could not set the save aside (${e instanceof Error ? e.message : String(e)})`;
      return null;
    }
    if (!key) {
      this.asideRefused = true;
      this.detail = 'the stored save changed since this tab read it (another tab?) — nothing was moved; reload to see it';
      return null;
    }
    this.asideKey = key;
    this.refused = null;
    this.base = 0;
    this.baseWriter = '';
    this.baseSeq = 0;
    this.gen = 0;
    this.state = 'pending';
    this.detail = `the old save is kept as ${key}`;
    return key;
  }
}

/** Fallback writer ids, unique within this module's lifetime; the page passes a random one. */
let sessions = 0;

/** How long a load waits for the stored record before giving up on it (unwritably). */
export const READ_TIMEOUT_MS = 10_000;

export interface OpenOptions<W> {
  readTimeoutMs?: number;
  chain?: Chain<W>;
  unavailable?: string;
  journal?: Journal | null;
  /** This session's id, unique per page load. */
  writer?: string;
  clock?: () => number;
}

/**
 * Read the stored world (or a newer journal entry over it), or make a fresh one, and the
 * session that will save it. `fresh` builds the world used when nothing usable is stored.
 */
export async function openWorld<W = World>(
  store: SaveStore | null,
  fresh: () => W,
  opts: OpenOptions<W> = {},
): Promise<{ world: W; session: SaveSession; report: LoadReport }> {
  const chain = opts.chain ?? (CHAIN as unknown as Chain<W>);
  const writer = opts.writer ?? `session-${++sessions}`;
  const base = { writer, journal: opts.journal ?? null, ...(opts.clock ? { clock: opts.clock } : {}) };
  if (!store) {
    const detail = opts.unavailable ?? 'no save store';
    return {
      world: fresh(),
      session: new SaveSession(null, { ...base, state: 'unavailable', detail, base: 0 }),
      report: { source: 'fresh', fromSchema: null, gen: 0, detail },
    };
  }
  let raw: unknown;
  try {
    raw = await store.get(MAIN_KEY, opts.readTimeoutMs ?? READ_TIMEOUT_MS);
  } catch (e) {
    // Could not even read (or not in time): writing blind could replace a record we never
    // saw, so this session never writes. The record stays exactly as it is.
    const detail = e instanceof Error && e.name === 'StoreTimeoutError'
      ? `timeout: ${e.message}` : `read failed (${e instanceof Error ? e.message : String(e)})`;
    return {
      world: fresh(),
      session: new SaveSession(null, { ...base, state: 'unavailable', detail, base: 0 }),
      report: { source: 'refused', fromSchema: null, gen: 0, detail },
    };
  }
  const gen = genOf(raw);
  const refuse = (reason: Refusal, detail: string) => ({
    world: fresh(),
    session: new SaveSession(store, {
      ...base, state: reason, detail, base: gen,
      refused: { gen, raw, salvage: isStoredSave(raw) ? salvageGenomes(raw.text) : [] },
    }),
    report: { source: 'refused' as const, fromSchema: null, gen, detail },
  });
  if (raw !== undefined && !isStoredSave(raw)) return refuse('corrupt', 'the stored record is not a save envelope');

  const decoded = isStoredSave(raw) ? decodeSave(raw.text, chain) : null;
  if (decoded && !decoded.ok) return refuse(decoded.reason, decoded.detail);
  const fromMain = decoded?.ok ? decoded.from : null;
  const backup = fromMain !== null && fromMain < chain.target ? backupKey(fromMain) : undefined;

  // A journal entry written on top of this record and never landed: newest first.
  const entries = opts.journal?.read() ?? [];
  const candidates = entries.filter((e) => promotable(e, raw))
    .sort((a, b) => b.savedAt - a.savedAt || b.seq - a.seq);
  let fromJournal: { world: W; from: number; savedAt: number } | null = null;
  for (const e of candidates) {
    const d = decodeSave(e.text, chain);
    if (d.ok) { fromJournal = { world: d.world, from: d.from, savedAt: e.savedAt }; break; }
  }
  const session = new SaveSession(store, {
    ...base, state: 'pending', detail: '', ...baseRefOf(raw as StoredSave | undefined),
    ...(backup !== undefined ? { backup } : {}),
    sweep: entries.map((e) => e.writer),
  });
  if (fromJournal) {
    return {
      world: fromJournal.world, session,
      report: {
        source: 'journal', fromSchema: fromMain, gen,
        detail: `the journal held a save newer than stored gen ${gen} that had not reached IndexedDB`,
      },
    };
  }
  if (!decoded) {
    return { world: fresh(), session, report: { source: 'fresh', fromSchema: null, gen: 0, detail: 'no save yet' } };
  }
  return {
    world: (decoded as { world: W }).world, session,
    report: {
      source: 'loaded', fromSchema: fromMain, gen,
      detail: backup ? `migrated from schema ${fromMain} to ${chain.target}` : `schema ${fromMain}`,
    },
  };
}

/** `openWorld` for this build's schema, a fresh world seeded with `seed` when needed. */
export function openGameWorld(
  store: SaveStore | null, seed: number, opts: Omit<OpenOptions<World>, 'chain'> = {},
) {
  return openWorld<World>(store, () => createWorld(seed), opts);
}
