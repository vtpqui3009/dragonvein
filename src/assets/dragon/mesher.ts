/**
 * Build dragons off the main thread (M3c). One worker, requests answered in order.
 *
 *   const mesher = new DragonMesher();
 *   const { body, workerMs, roundTripMs } = await mesher.build(genome);
 *
 * The main thread only serialises the genome and wraps the transferred arrays in a
 * `BufferGeometry` (`assembleMs`); the skin, membranes and primitives are built in
 * ./worker.ts. Load this module lazily (`import()`), so the game does not pay for the
 * worker at boot.
 *
 * **Warm it before the moment that matters.** A fresh worker's first build pays for
 * fetching and parsing its module and for a cold JIT. Measured on the game page in run 13:
 * a 144.8 ms round trip, against about 9 ms for every build after it. `ready()` spawns
 * and warms the worker with one throwaway dragon. Call it when the game is idle, before a
 * hatch can happen, and the hatch gets a warm builder. `gate:meshgen` reports the warm-up
 * separately (`startupMs`) and holds every real build to 120 ms.
 */
import type { Genome } from '../../core/genome';
import { toGeometry, type DragonBody } from './builder';
import type { MeshError, MeshReply, MeshRequest, WarmReply, WarmRequest } from './worker';

export interface MeshResult {
  body: DragonBody;
  /** The build inside the worker. */
  workerMs: number;
  /** From posting the genome to a ready geometry on this thread. */
  roundTripMs: number;
  /** The main thread's share: wrapping the arrays and computing bounds. */
  assembleMs: number;
}

export class DragonMesher {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private readonly pending = new Map<number, { t0: number; resolve: (r: MeshResult) => void; reject: (e: Error) => void }>();
  private warming: Promise<{ startupMs: number; warmMs: number }> | null = null;
  private readonly warmJobs = new Map<number, {
    t0: number; resolve: (r: { startupMs: number; warmMs: number }) => void; reject: (e: Error) => void;
  }>();
  /**
   * Set once the worker has failed to load or crashed. From then on every request rejects
   * at once. A dead worker answers nothing, so an awaited `ready()` or `build()` used to
   * hang forever with no error (gameplay critic, run 13).
   */
  private failure: Error | null = null;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<MeshReply | WarmReply | MeshError>) => {
      const w = this.warmJobs.get(e.data.id);
      if (w) {
        this.warmJobs.delete(e.data.id);
        if ('error' in e.data) w.reject(new Error(e.data.error));
        else if ('warmMs' in e.data) w.resolve({ startupMs: performance.now() - w.t0, warmMs: e.data.warmMs });
        return;
      }
      const job = this.pending.get(e.data.id);
      if (!job) return;
      this.pending.delete(e.data.id);
      if ('error' in e.data) { job.reject(new Error(e.data.error)); return; }
      if (!('arrays' in e.data)) { job.reject(new Error('dragon worker: a build answered as a warm-up')); return; }
      const t1 = performance.now();
      const body = toGeometry(e.data.arrays);
      const t2 = performance.now();
      job.resolve({ body, workerMs: e.data.workerMs, roundTripMs: t2 - job.t0, assembleMs: t2 - t1 });
    };
    this.worker.onerror = (e) => this.fail(new Error(`dragon worker failed: ${e.message || 'could not load or crashed'}`));
    this.worker.onmessageerror = () => this.fail(new Error('dragon worker: a message could not be decoded'));
  }

  /** Spawn and warm the worker: one throwaway build. Idempotent; await it before a hatch. */
  ready(): Promise<{ startupMs: number; warmMs: number }> {
    if (this.failure) return Promise.reject(this.failure);
    if (!this.warming) {
      const id = this.nextId++;
      const req: WarmRequest = { id, warm: true };
      this.warming = new Promise((resolve, reject) => {
        this.warmJobs.set(id, { t0: performance.now(), resolve, reject });
        this.worker.postMessage(req);
      });
    }
    return this.warming;
  }

  build(genome: Genome): Promise<MeshResult> {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    const req: MeshRequest = { id, genome: genome.toJSON() };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { t0: performance.now(), resolve, reject });
      this.worker.postMessage(req);
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.fail(new Error('dragon mesher disposed'));
  }

  /** Reject everything waiting, and everything asked from now on. */
  private fail(err: Error): void {
    this.failure ??= err;
    for (const job of this.pending.values()) job.reject(err);
    for (const w of this.warmJobs.values()) w.reject(err);
    this.pending.clear();
    this.warmJobs.clear();
  }
}
