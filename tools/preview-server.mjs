/** Starts `vite preview` and waits until it actually answers. Racing the server start
 *  is the classic flaky-gate bug: the port is spawned but not listening yet. */
import { spawn } from 'node:child_process';

export async function startPreview(port) {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/dragonvein/`;
  const deadline = Date.now() + 40_000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`vite preview exited with ${proc.exitCode}`);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return { proc, url };
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) { proc.kill(); throw new Error(`preview server never answered at ${url}`); }
    await new Promise((r) => setTimeout(r, 400));
  }
}
