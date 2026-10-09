/**
 * Starts `vite preview` for the gates and waits until it actually answers.
 *
 * Four bugs this file exists to prevent, all of them observed:
 *
 * 1. **Binding one address and polling another.** `vite preview` with no `--host` binds
 *    the *hostname* `localhost`. On a GitHub runner `localhost` resolves to `::1` before
 *    `127.0.0.1`, so the server listened on IPv6 while the poll fetched the IPv4 literal
 *    and nothing was ever listening there (CI run 37920381558). Host and URL now both
 *    come from `PREVIEW_HOST`, so they are the same address by construction, and the base
 *    path comes from the same module `vite.config.ts` reads.
 * 2. **Throwing away the child's output.** `stdio: 'ignore'` meant a failure could not say
 *    why. The child's stdout and stderr are captured and the tail goes into the Error.
 * 3. **Missing a child killed by a signal.** `exitCode` stays `null` when a process dies
 *    on SIGKILL or SIGSEGV, so the poll looped to the deadline instead of failing fast.
 *    `signalCode` is checked too.
 * 4. **Orphans.** Spawning through `npx` meant `proc.kill()` killed the `npx` wrapper and
 *    left `vite preview` holding the port; the next run's poll then got a 200 from that
 *    stale server while its own child died of EADDRINUSE. Vite's CLI is now run directly
 *    on this node, so kill() reaches it, and the port is checked before spawning.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { BASE_PATH } from './site-config.mjs';

/**
 * The single loopback address. Passed to `--host` *and* used to build the poll URL, so
 * the server cannot listen somewhere the poller is not looking. An IP literal, never a
 * hostname: hostnames go through DNS, DNS orders address families differently per
 * machine, and that difference is the entire bug.
 */
export const PREVIEW_HOST = '127.0.0.1';

/** @param {number} port @returns {string} */
export function previewUrl(port) {
  return `http://${PREVIEW_HOST}:${port}${BASE_PATH}`;
}

/** Resolve vite's CLI from its own manifest and run it on this node directly — no `npx`
 *  wrapper process to swallow our kill() and leave the port held against --strictPort. */
function resolveViteBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('vite/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.vite;
  if (!bin) throw new Error(`vite/package.json declares no "bin" entry (${manifestPath})`);
  return path.join(path.dirname(manifestPath), bin);
}

/**
 * The exact argv `startPreview` runs. Exported so a test can assert that the address
 * handed to `--host` is the same literal `previewUrl` polls, rather than trusting a
 * comment to keep them together.
 * @param {number} port
 * @returns {string[]}
 */
export function previewArgs(port) {
  return [
    resolveViteBin(), 'preview',
    '--host', PREVIEW_HOST,
    '--port', String(port),
    '--strictPort',
  ];
}

/**
 * Fail loudly if something already holds the port. Without this the poller can get a 200
 * from a *stranger* — an orphaned preview from an earlier run, say — while our own child
 * is quietly dying of EADDRINUSE, and the gate then measures a build nobody asked for.
 * @param {number} port
 * @returns {Promise<void>}
 */
async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (/** @type {NodeJS.ErrnoException} */ e) => {
      reject(e.code === 'EADDRINUSE'
        ? new Error(
          `${PREVIEW_HOST}:${port} is already in use, so the gate would have measured ` +
          'whatever is listening there rather than its own preview. Most likely an ' +
          'orphaned `vite preview` from an earlier run: find it with ' +
          `\`ps aux | grep "vite preview"\` and kill it.`)
        : e);
    });
    probe.listen(port, PREVIEW_HOST, () => probe.close(() => { resolve(undefined); }));
  });
}

/**
 * @param {number} port
 * @returns {Promise<{ proc: import('node:child_process').ChildProcess, url: string }>}
 */
export async function startPreview(port) {
  const url = previewUrl(port);
  await assertPortFree(port);
  const args = previewArgs(port);
  const proc = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  // Keep only the tail: enough to diagnose, not enough to flood a CI log.
  const MAX_LOG = 6000;
  let output = '';
  const capture = (chunk) => { output = (output + chunk).slice(-MAX_LOG); };
  proc.stdout?.setEncoding('utf8');
  proc.stdout?.on('data', capture);
  proc.stderr?.setEncoding('utf8');
  proc.stderr?.on('data', capture);

  /** @type {Error | null} */
  let spawnError = null;
  proc.on('error', (e) => { spawnError = e; });
  /** @type {string} */
  let lastPollError = 'none yet';

  const detail = () => {
    const tail = output.trim();
    return `\n  host bound: ${PREVIEW_HOST}  (same literal the poll fetches)` +
      `\n  last poll result: ${lastPollError}` +
      (spawnError ? `\n  spawn error: ${spawnError.message}` : '') +
      (tail
        ? `\n--- vite preview output (last ${MAX_LOG} chars) ---\n${tail}\n--- end of vite preview output ---`
        : '\n  vite preview produced no output at all');
  };

  const deadline = Date.now() + 40_000;
  for (;;) {
    // exitCode stays null for a process killed by a signal; signalCode catches that.
    if (proc.exitCode !== null || proc.signalCode !== null || spawnError) {
      throw new Error(
        `vite preview died before answering ${url} ` +
        `(exit=${proc.exitCode}, signal=${proc.signalCode})${detail()}`,
      );
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      // Alive-check again before trusting the 200: the answer has to be coming from the
      // child we started, not from something that beat it to the port.
      if (r.ok && proc.exitCode === null && proc.signalCode === null) return { proc, url };
      lastPollError = r.ok
        ? 'HTTP 200, but our own vite preview was no longer running'
        : `HTTP ${r.status} ${r.statusText}`;
    } catch (e) {
      lastPollError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error(`preview server never answered at ${url}${detail()}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}
