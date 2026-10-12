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
 */
import type { Genome } from '../../core/genome';
import { toGeometry, type DragonBody } from './builder';
import type { MeshError, MeshReply, MeshRequest } from './worker';

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

  constructor() {
    this.worker.onmessage = (e: MessageEvent<MeshReply | MeshError>) => {
      const job = this.pending.get(e.data.id);
      if (!job) return;
      this.pending.delete(e.data.id);
      if ('error' in e.data) { job.reject(new Error(e.data.error)); return; }
      const t1 = performance.now();
      const body = toGeometry(e.data.arrays);
      const t2 = performance.now();
      job.resolve({ body, workerMs: e.data.workerMs, roundTripMs: t2 - job.t0, assembleMs: t2 - t1 });
    };
    this.worker.onerror = (e) => {
      for (const job of this.pending.values()) job.reject(new Error(`dragon worker: ${e.message}`));
      this.pending.clear();
    };
  }

  build(genome: Genome): Promise<MeshResult> {
    const id = this.nextId++;
    const req: MeshRequest = { id, genome: genome.toJSON() };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { t0: performance.now(), resolve, reject });
      this.worker.postMessage(req);
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const job of this.pending.values()) job.reject(new Error('dragon mesher disposed'));
    this.pending.clear();
  }
}
