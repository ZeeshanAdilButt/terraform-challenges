// One pipeline run: init, plan, then apply the saved plan.
// One fault is planted here. The README says what to look for.
// Run: node ci/pipeline.mjs <folder with the Terraform code> --message <text>
// Environment: LOCK_TIMEOUT is how long a step may wait for the state lock (default 0s: do not wait).
// The state lives on an http backend, configured by backend.hcl in the folder.
// Exit code 0: applied. Exit code 1: a step failed (the output says which).

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function findToolkit() {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const p = join(d, 'toolkit', 'tf.js');
    if (existsSync(p)) return p;
    d = dirname(d);
  }
  throw new Error('Could not find toolkit/tf.js above this script.');
}

const args = process.argv.slice(2);
const dir = resolve(args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) || '.');
const message = args[args.indexOf('--message') + 1] || 'base';

const { tf } = await import(pathToFileURL(findToolkit()).href);
// Somebody added this once, to make a lock error go away.
const lock = ['-lock=false'];

const steps = [
  ['init', ['init', '-input=false', '-backend-config=backend.hcl']],
  ['plan', ['plan', '-input=false', '-out=plan.tfplan', `-var=message=${message}`, ...lock]],
  ['apply', ['apply', '-input=false', ...lock, 'plan.tfplan']],
];

for (const [name, a] of steps) {
  const t0 = Date.now();
  console.log(`[${name}] terraform ${a.join(' ')}`);
  const r = tf(a, { cwd: dir, docker: true });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const lines = r.out.split('\n').map((l) => l.replace(/^[│╷╵]\s?/, '').trimEnd());
  if (r.code !== 0) {
    console.log(`[${name}] FAILED (exit ${r.code}) after ${secs}s`);
    const first = Math.max(lines.findIndex((l) => l.startsWith('Error:')), 0);
    console.log(lines.slice(first).filter((l) => l.trim()).slice(0, 14).join('\n'));
    process.exit(1);
  }
  const waited = lines.find((l) => /Acquiring state lock/.test(l));
  console.log(`[${name}] ok after ${secs}s${waited ? ' (it had to wait for the lock)' : ''}`);
}
console.log('pipeline: applied.');
