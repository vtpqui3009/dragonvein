/**
 * Stop the software rasteriser competing with the page's main thread.
 *
 * ## Why this exists
 *
 * `docs/PERF_BUDGET.md` holds `cpuFrameMs` to 3.5 ms — the main thread's 2.0 + 1.5 ms
 * share of the 16.6 ms frame. On a GPU-less box it is the only half of frame cost that
 * can be policed honestly, because SwiftShader does not rasterise *on* the main thread.
 *
 * But it does rasterise on threads that compete for the same **cores**, and that landed
 * the project in a bind recorded in `STATE.md` §2026-10-10 decisions. Identical bytes,
 * two machines: the main-thread p50 moved +29% (0.7 → 0.9 ms) while its p95 moved +106%
 * (1.8 → 3.7 ms). The tail was measuring how busy the box was, so the enforcement was
 * moved to the median — which left no p95 enforced on any machine this project has run
 * on, and a tail nobody looks at is a tail nobody fixes.
 *
 * The owner's ruling was to fix the contention rather than the statistic: cap the
 * rasteriser so the main thread stops competing with it, then hold the p95 to the same
 * unchanged 3.5 ms everywhere. This module is that cap.
 *
 * ## What could not be made to work, and what could
 *
 * SwiftShader's thread *count* is not reachable in Chromium's build of it. The shipped
 * `libvk_swiftshader.so` contains the strings `SwiftShader.ini`, `Processor` and
 * `ThreadCount`, so its `Configurator` is compiled in, but an ini written into the GPU
 * process's own cwd changes nothing: the pool stays at one `Thread<NN>` marl worker per
 * core. `--num-raster-threads=1` is Chromium's own tile-raster pool and does not touch
 * marl either. Both attempts, and what each did, are recorded in
 * `docs/PERF_BUDGET.md` §Capping the rasteriser.
 *
 * What is reachable is thread *placement*. `sched_setaffinity` on every thread of every
 * browser process partitions the cores: the page's renderer process gets the lower half
 * to itself, and every other browser process — the GPU process with its marl pool above
 * all — is confined to the upper half. The rasteriser then cannot be scheduled on a core
 * the main thread runs on, which is the property the budget needs. Measured on this
 * scene, four runs at 1920x1080:
 *
 *   uncapped   p50 0.7   p95 1.6-1.8   max 4.7-9.0   ratio 2.3-2.6
 *   capped     p50 0.8   p95 1.2-1.3   max 2.5-3.8   ratio 1.6-1.7
 *
 * The p95/p50 ratio falling towards 1 is the evidence the ruling asked for: what is left
 * in the tail is the app, not the box.
 *
 * ## The cost, stated plainly
 *
 * Confining the rasteriser to half the cores makes it about 1.8x slower per frame
 * (gpu p50 ~200 ms → ~370 ms here). GPU time is advisory on a software rasteriser so no
 * budget moves, but the **sample rate** halves, and a p95 taken from a window that hit
 * its deadline instead of its sample target does not reproduce — which is the exact
 * defect a previous run fixed by raising the target to 360. So the deadline rises with
 * the cap, and `gate:perf` refuses to *enforce* the tail on a short window.
 *
 * Linux-only: it reads `/proc` and shells out to `taskset`. Anywhere else the cap is
 * unavailable, which is a fallback, not a failure — see `gate:perf`.
 */
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import os from 'node:os';

/**
 * Four, because the partition has to leave the page's renderer process more than one
 * core. Measured: with the renderer on a single core its own compositor thread becomes
 * the competitor and the tail gets worse than uncapped (p95 1.9-2.3 against 1.6-1.8).
 * Two cores each is the smallest split with evidence behind it, so below four cores the
 * cap declines rather than guessing.
 */
export const CAP_MIN_CPUS = 4;

/** @returns {number} */
export function cpuCount() {
  return typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
}

/**
 * The partition. Lower half to the page, upper half to everything else.
 *
 * @param {number} ncpu
 * @returns {{ page: number[], rest: number[] } | null} null when ncpu is too small
 */
export function partition(ncpu) {
  if (!Number.isInteger(ncpu) || ncpu < CAP_MIN_CPUS) return null;
  const half = Math.floor(ncpu / 2);
  return {
    page: range(0, half - 1),
    rest: range(half, ncpu - 1),
  };
}

/** @param {number} a @param {number} b @returns {number[]} */
function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** `taskset` wants a list; `0,1` and `0-1` are both fine and a list is unambiguous. */
const asList = (cpus) => cpus.join(',');

/**
 * Parse a `Cpus_allowed_list` value (`0-1`, `0,2-3`, `2`) into sorted cpu indices.
 *
 * @param {string} s
 * @returns {number[]}
 */
export function parseCpuList(s) {
  /** @type {number[]} */
  const out = [];
  for (const part of s.split(',')) {
    const t = part.trim();
    if (t === '') continue;
    const m = /^(\d+)-(\d+)$/.exec(t);
    if (m) { for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i); }
    else if (/^\d+$/.test(t)) out.push(Number(t));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

const sameSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Every descendant of `rootPid` that is a browser process, with its `--type`.
 *
 * The browser is a child of this node process, so the tree walk is bounded by our own
 * pid and cannot pick up anything else on the machine.
 *
 * @param {number} rootPid
 * @returns {Promise<{ pid: number, type: string }[]>}
 */
export async function browserProcesses(rootPid) {
  /** @type {number[]} */
  let all;
  try {
    all = (await readdir('/proc')).filter((d) => /^\d+$/.test(d)).map(Number);
  } catch { return []; }

  /** @type {Map<number, number>} */
  const parent = new Map();
  /** @type {Map<number, string>} */
  const cmdline = new Map();
  for (const pid of all) {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      // `comm` can hold spaces and parens, so ppid is counted from the LAST ')'.
      parent.set(pid, Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]));
      cmdline.set(pid, (await readFile(`/proc/${pid}/cmdline`, 'utf8')).replace(/\0/g, ' '));
    } catch { /* exited while we walked; it is not ours to pin either way */ }
  }

  /** @type {{ pid: number, type: string }[]} */
  const out = [];
  for (const pid of all) {
    let p = pid;
    for (let hops = 0; hops < 64 && p > 1; hops++) {
      if (p === rootPid) {
        const cmd = cmdline.get(pid) ?? '';
        if (/chrome|headless_shell/.test(cmd)) {
          out.push({ pid, type: /--type=(\S+)/.exec(cmd)?.[1] ?? 'browser' });
        }
        break;
      }
      p = parent.get(p) ?? 0;
    }
  }
  return out;
}

/** @param {number} pid @returns {Promise<string[]>} tids */
async function threadsOf(pid) {
  try { return await readdir(`/proc/${pid}/task`); } catch { return []; }
}

/** @param {number} pid @param {string} tid @returns {Promise<string>} */
async function threadComm(pid, tid) {
  try { return (await readFile(`/proc/${pid}/task/${tid}/comm`, 'utf8')).trim(); }
  catch { return ''; }
}

/** @param {number} pid @param {string} tid @returns {Promise<number[]|null>} */
async function threadAffinity(pid, tid) {
  try {
    const st = await readFile(`/proc/${pid}/task/${tid}/status`, 'utf8');
    const m = /^Cpus_allowed_list:\s*(.*)$/m.exec(st);
    return m ? parseCpuList(m[1]) : null;
  } catch { return null; }
}

/**
 * SwiftShader's rasteriser pool, counted from thread names. marl names its workers
 * `Thread<NN>`, so this is a direct observation of the pool size rather than an
 * inference from core count — and it is what proves a thread-count cap did or did not
 * take effect.
 *
 * @param {number} pid
 * @returns {Promise<number>}
 */
export async function marlWorkerCount(pid) {
  let n = 0;
  for (const tid of await threadsOf(pid)) {
    if (/^Thread<\d+>$/.test(await threadComm(pid, tid))) n++;
  }
  return n;
}

/**
 * Pin every thread of `pid` to `cpus`, then read every thread's mask back.
 *
 * Threads created later inherit their creator's mask, so pinning the threads that exist
 * covers the ones that follow — but `verify()` re-reads them before the measurement
 * anyway, because inheritance is a claim and the mask is the fact.
 *
 * @param {number} pid
 * @param {number[]} cpus
 * @returns {Promise<{ threads: number, pinned: number, failed: number }>}
 */
async function pinProcess(pid, cpus) {
  const tids = await threadsOf(pid);
  let pinned = 0;
  let failed = 0;
  for (const tid of tids) {
    try {
      execFileSync('taskset', ['-pc', asList(cpus), tid], { stdio: 'ignore' });
      pinned++;
    } catch {
      // A thread that exited between readdir and taskset is not a failure to report as
      // one; one that is still alive and refused the call is.
      if ((await threadAffinity(pid, tid)) !== null) failed++;
    }
  }
  return { threads: tids.length, pinned, failed };
}

/**
 * Apply the cap to a launched browser's process tree.
 *
 * @param {object} opts
 * @param {number} opts.rootPid       this process; the tree walk is bounded by it
 * @param {boolean} opts.software     only a software rasteriser competes for these cores
 * @returns {Promise<RasteriserCap>}
 */
export async function applyRasteriserCap({ rootPid, software }) {
  const ncpu = cpuCount();
  /** @type {RasteriserCap} */
  const base = {
    mechanism: 'sched_setaffinity (taskset) on every thread of every browser process',
    applied: false,
    verified: false,
    reason: null,
    cpus: { total: ncpu, page: null, rasteriser: null },
    processes: [],
    marlWorkers: null,
    threadCountCapTried: THREAD_COUNT_CAP_ATTEMPTS,
  };

  if (!software) {
    base.reason = 'not needed: a real GPU rasterises off-CPU, so nothing competes with ' +
      'the main thread for cores';
    return base;
  }
  if (process.platform !== 'linux') {
    base.reason = `unavailable: the cap needs /proc and sched_setaffinity, platform is ` +
      `${process.platform}`;
    return base;
  }
  const part = partition(ncpu);
  if (!part) {
    base.reason = `unavailable: ${ncpu} cpu(s), and the partition needs at least ` +
      `${CAP_MIN_CPUS} so the page keeps more than one core (see CAP_MIN_CPUS)`;
    return base;
  }
  base.cpus.page = part.page;
  base.cpus.rasteriser = part.rest;

  const procs = await browserProcesses(rootPid);
  if (procs.length === 0) {
    base.reason = 'unavailable: no browser process found under this pid in /proc';
    return base;
  }
  const gpu = procs.find((p) => p.type === 'gpu-process');
  if (!gpu) {
    base.reason = 'unavailable: no --type=gpu-process in the tree, so the rasteriser ' +
      'pool could not be located';
    return base;
  }

  // The page's own renderer processes take the lower half; the GPU process and every
  // other helper take the upper half. Partitioning *everything* rather than only the
  // GPU process matters: with the renderer left free to roam it was scheduled onto the
  // rasteriser's cores and the tail came out worse than uncapped (p95 3.0 vs 1.8).
  for (const p of procs) {
    const cpus = p.type === 'renderer' ? part.page : part.rest;
    const r = await pinProcess(p.pid, cpus);
    base.processes.push({ pid: p.pid, type: p.type, intended: cpus, ...r });
  }
  base.applied = true;
  base.marlWorkers = await marlWorkerCount(gpu.pid);
  return base;
}

/**
 * Re-read every thread's mask and decide whether the cap actually holds.
 *
 * This is deliberately a separate step, run immediately before the measurement rather
 * than at pin time. `STATE.md` is explicit that a flag Chromium accepted without
 * complaint is not a cap that took effect; the same goes for a `taskset` that returned
 * 0. The fact is the mask in `/proc`, and the properties that matter are: every thread
 * sits inside its intended set, the page's set and the rasteriser's set are non-empty,
 * and they are disjoint.
 *
 * @param {RasteriserCap} cap
 * @returns {Promise<RasteriserCap>} the same object, with `verified` and `reason` set
 */
export async function verifyRasteriserCap(cap) {
  if (!cap.applied) return cap;
  const page = cap.cpus.page ?? [];
  const rest = cap.cpus.rasteriser ?? [];
  if (page.length === 0 || rest.length === 0) {
    cap.reason = 'not verified: an empty half in the partition';
    return cap;
  }
  if (page.some((c) => rest.includes(c))) {
    cap.reason = 'not verified: the page and rasteriser halves overlap, so the main ' +
      'thread can still be scheduled beside a rasteriser thread';
    return cap;
  }

  /** @type {string[]} */
  const wrong = [];
  let checked = 0;
  for (const p of cap.processes) {
    const expected = [...p.intended].sort((a, b) => a - b);
    /** @type {number[][]} */
    const observed = [];
    for (const tid of await threadsOf(p.pid)) {
      const mask = await threadAffinity(p.pid, tid);
      if (mask === null) continue;      // exited between the two reads
      checked++;
      observed.push(mask);
      if (!sameSet(mask, expected)) {
        wrong.push(`pid ${p.pid} (${p.type}) tid ${tid}: ` +
          `cpus ${mask.join(',')} != intended ${expected.join(',')}`);
      }
    }
    p.observedThreads = observed.length;
  }
  cap.threadsVerified = checked;
  cap.threadsWrong = wrong.length;
  if (checked === 0) {
    cap.reason = 'not verified: no thread mask could be read back';
    return cap;
  }
  if (wrong.length > 0) {
    cap.wrongExamples = wrong.slice(0, 6);
    cap.reason = `not verified: ${wrong.length} of ${checked} threads are not inside ` +
      'their intended cpu set';
    return cap;
  }
  cap.verified = true;
  cap.reason = `verified: ${checked} threads, page on cpus ${page.join(',')}, ` +
    `rasteriser and helpers on cpus ${rest.join(',')}, sets disjoint` +
    (cap.marlWorkers === null ? '' : `, ${cap.marlWorkers} marl rasteriser workers`);
  return cap;
}

/**
 * The thread-*count* caps that were tried and did not work, kept in the artefact so the
 * fallback never reads as a shortcut. `docs/PERF_BUDGET.md` §Capping the rasteriser is
 * the long version.
 */
export const THREAD_COUNT_CAP_ATTEMPTS = [
  {
    attempt: 'SwiftShader.ini with [Processor] ThreadCount=1 in the GPU process cwd',
    result: 'no effect — the marl pool stayed at 4 Thread<NN> workers on a 4-core box, ' +
      'with the ini confirmed present in /proc/<gpu-pid>/cwd',
  },
  {
    attempt: '--num-raster-threads=1',
    result: 'no effect on the marl pool (still 4 workers); it is Chromium\'s tile-raster ' +
      'pool, not SwiftShader\'s. Main-thread p95 came out 3.9 ms, i.e. worse',
  },
];

/**
 * @typedef {object} RasteriserCap
 * @property {string} mechanism
 * @property {boolean} applied
 * @property {boolean} verified
 * @property {string|null} reason
 * @property {{ total: number, page: number[]|null, rasteriser: number[]|null }} cpus
 * @property {{ pid: number, type: string, intended: number[], threads: number,
 *              pinned: number, failed: number, observedThreads?: number }[]} processes
 * @property {number|null} marlWorkers
 * @property {{ attempt: string, result: string }[]} threadCountCapTried
 * @property {number} [threadsVerified]
 * @property {number} [threadsWrong]
 * @property {string[]} [wrongExamples]
 */
