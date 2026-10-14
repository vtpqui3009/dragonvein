/**
 * The dragon mesher's worker: genome in, mesh arrays out, off the main thread (M3c,
 * CLAUDE.md §2.3). ./mesher.ts is its client.
 *
 * The request carries the genome as JSON (`Genome.toJSON`). The reply carries the eight
 * typed arrays (position, normal, colour, index, the idle's two weights and the skin's
 * index and weight, M7b) as transferables, so they move to the main thread without a copy,
 * plus the small plain data (groups, parts, kinds, graph, the bone table) and the build time
 * measured here.
 */
import { Genome, wild, type GenomeJson } from '../../core/genome';
import { buildDragonArrays, type DragonArrays } from './arrays';

export interface MeshRequest { id: number; genome: GenomeJson }
/** Build one throwaway dragon so the first real one does not pay for a cold JIT. */
export interface WarmRequest { id: number; warm: true }
export interface MeshReply { id: number; arrays: DragonArrays; workerMs: number }
export interface MeshError { id: number; error: string }
export interface WarmReply { id: number; warmMs: number }

/** The warm-up: one whole dragon, built and dropped. */
export function warm(req: WarmRequest): WarmReply {
  const t0 = performance.now();
  buildDragonArrays(wild(1, 'ember'));
  return { id: req.id, warmMs: performance.now() - t0 };
}

/** Handle one request. Pure apart from the clock, so tests can call it without a Worker. */
export function handle(req: MeshRequest): { reply: MeshReply; transfer: ArrayBuffer[] } {
  const t0 = performance.now();
  const arrays = buildDragonArrays(Genome.fromJSON(req.genome));
  const workerMs = performance.now() - t0;
  const transfer = [
    arrays.position.buffer, arrays.normal.buffer, arrays.color.buffer, arrays.index.buffer,
    arrays.idleBreathSway.buffer, arrays.idleBlink.buffer, arrays.skinIndex.buffer, arrays.skinWeight.buffer,
  ] as ArrayBuffer[];
  return { reply: { id: req.id, arrays, workerMs }, transfer };
}

// Only when actually running as a worker: tests import `handle` directly.
const scope = globalThis as unknown as {
  WorkerGlobalScope?: unknown;
  onmessage: ((e: MessageEvent<MeshRequest | WarmRequest>) => void) | null;
  postMessage(msg: MeshReply | WarmReply | MeshError, transfer?: Transferable[]): void;
};
if (typeof scope.WorkerGlobalScope !== 'undefined') {
  scope.onmessage = (e) => {
    try {
      if ('warm' in e.data) { scope.postMessage(warm(e.data)); return; }
      const { reply, transfer } = handle(e.data);
      scope.postMessage(reply, transfer);
    } catch (err) {
      scope.postMessage({ id: e.data.id, error: String((err as Error)?.stack ?? err) });
    }
  };
}
