/**
 * Loading a world and keeping it saved (M8a): the policy over src/core/save.ts.
 *
 * No clock, no DOM: the caller passes wall-clock stamps in, so this runs under vitest
 * against `memoryStore` exactly as it runs in the page against IndexedDB.
 *
 * The rules, each of which `tests/save.test.ts` exercises:
 *   - **Load never blocks play.** No store, an unreadable store, or a refused record all
 *     still yield a world — a fresh one — and a session that says why it will not save.
 *   - **A refused record is never written over.** A `newer`, `corrupt` or `incomplete` main
 *     record leaves the session unwritable for its whole life, so the record (and any
 *     backup beside it) is exactly as found when a fixed build comes to read it.
 *   - **A migrated record is backed up before its first write.** The first save after
 *     loading schema N < current copies the stored record to `backup.vN` in the same
 *     transaction that writes the migrated one.
 *   - **A session only replaces what it last saw.** It writes with the `gen` it loaded; when
 *     another tab has written since, the store refuses, and this session stops saving
 *     (`conflict`) instead of overwriting a roster it has never seen.
 *   - **Saves never overlap.** A save requested while one is in flight is coalesced: the
 *     newest serialised world is written next, so writes reach the store in order, each
 *     expecting the gen the previous one produced.
 */
import { MAIN_KEY, backupKey, isStoredSave, type SaveStore } from '../core/save';
import { CHAIN, decodeSave, encodeSave, type Chain, type Refusal } from './migrate';
import { createWorld, type World } from './world';

export type SaveState =
  /** Writable; nothing written by this session yet. */
  | 'pending'
  /** The last write landed; see `lastSavedAt`. */
  | 'saved'
  /** The last write failed with a storage error. Retried on the next save. */
  | 'error'
  /** No store: IndexedDB is missing, blocked or failed to open or read. */
  | 'unavailable'
  /** Another tab wrote after this one loaded. This session no longer saves. */
  | 'conflict'
  /** The stored record was refused, kept, and is never written over. */
  | Refusal;

export interface LoadReport {
  /** Where the world came from. */
  source: 'fresh' | 'loaded' | 'refused';
  /** The schema the record was stored at, when one was read. */
  fromSchema: number | null;
  /** The gen of the record read, 0 when there was none. */
  gen: number;
  detail: string;
}

export class SaveSession {
  state: SaveState;
  detail: string;
  /** The gen this session last loaded or wrote. */
  gen: number;
  /** Wall-clock ms of the last write that landed, or null. */
  lastSavedAt: number | null = null;
  /** Writes that landed in this session. */
  writes = 0;
  private backup: string | undefined;
  private queued: { text: string; at: number } | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly store: SaveStore | null,
    init: { state: SaveState; detail: string; gen: number; backup?: string },
  ) {
    this.state = init.state;
    this.detail = init.detail;
    this.gen = init.gen;
    this.backup = init.backup;
  }

  /** False once the session must never write again: no store, a refused record, or a conflict. */
  get writable(): boolean {
    return this.store !== null && (this.state === 'pending' || this.state === 'saved' || this.state === 'error');
  }

  /**
   * Serialise `world` now and write it, after any write in flight. Resolves when the store
   * has answered for this world (or a newer one queued behind it). Never rejects.
   */
  save(world: object, now: number): Promise<void> {
    if (!this.writable) return Promise.resolve();
    this.queued = { text: encodeSave(world), at: now };
    if (!this.inflight) this.inflight = this.drain();
    return this.inflight;
  }

  /** Another tab announced a write past ours: stop now, before our next save is refused. */
  markStale(gen: number): void {
    if (gen > this.gen && this.writable) {
      this.state = 'conflict';
      this.detail = `another tab saved (gen ${gen}, this tab had ${this.gen})`;
    }
  }

  private async drain(): Promise<void> {
    try {
      while (this.queued && this.writable && this.store) {
        const { text, at } = this.queued;
        this.queued = null;
        try {
          const r = await this.store.write({
            text, savedAt: at, expectGen: this.gen,
            ...(this.backup !== undefined ? { backupKey: this.backup } : {}),
          });
          if (r.ok) {
            this.gen = r.gen;
            this.backup = undefined;
            this.state = 'saved';
            this.detail = '';
            this.lastSavedAt = at;
            this.writes++;
          } else {
            this.state = 'conflict';
            this.detail = r.gen < 0
              ? 'the stored record changed into something unreadable; not overwritten'
              : `another tab saved (gen ${r.gen}, this tab had ${this.gen})`;
          }
        } catch (e) {
          this.state = 'error';
          this.detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        }
      }
    } finally {
      this.inflight = null;
    }
  }
}

/**
 * Read the stored world, or make a fresh one, and the session that will save it.
 * `fresh` builds the world used when nothing (usable) is stored.
 */
export async function openWorld<W = World>(
  store: SaveStore | null,
  fresh: () => W,
  opts: { chain?: Chain<W>; unavailable?: string } = {},
): Promise<{ world: W; session: SaveSession; report: LoadReport }> {
  const chain = opts.chain ?? (CHAIN as unknown as Chain<W>);
  const refuse = (state: SaveState, detail: string, gen: number, fromSchema: number | null) => ({
    world: fresh(),
    session: new SaveSession(state === 'unavailable' ? null : store, { state, detail, gen }),
    report: { source: 'refused' as const, fromSchema, gen, detail },
  });
  if (!store) {
    const detail = opts.unavailable ?? 'no save store';
    return { ...refuse('unavailable', detail, 0, null), report: { source: 'fresh', fromSchema: null, gen: 0, detail } };
  }
  let raw: unknown;
  try {
    raw = await store.get(MAIN_KEY);
  } catch (e) {
    // Could not even read: writing blind could replace a record we never saw.
    return refuse('unavailable', `read failed (${e instanceof Error ? e.message : String(e)})`, 0, null);
  }
  if (raw === undefined) {
    return {
      world: fresh(),
      session: new SaveSession(store, { state: 'pending', detail: '', gen: 0 }),
      report: { source: 'fresh', fromSchema: null, gen: 0, detail: 'no save yet' },
    };
  }
  if (!isStoredSave(raw)) return refuse('corrupt', 'the stored record is not a save envelope', -1, null);
  const d = decodeSave(raw.text, chain);
  if (!d.ok) return refuse(d.reason, d.detail, raw.gen, null);
  const migrated = d.from < chain.target;
  return {
    world: d.world,
    session: new SaveSession(store, {
      state: 'pending', detail: '', gen: raw.gen, ...(migrated ? { backup: backupKey(d.from) } : {}),
    }),
    report: {
      source: 'loaded', fromSchema: d.from, gen: raw.gen,
      detail: migrated ? `migrated from schema ${d.from} to ${chain.target}` : `schema ${d.from}`,
    },
  };
}

/** `openWorld` for this build's schema, a fresh world seeded with `seed` when needed. */
export function openGameWorld(store: SaveStore | null, seed: number, unavailable?: string) {
  return openWorld<World>(store, () => createWorld(seed), unavailable !== undefined ? { unavailable } : {});
}
