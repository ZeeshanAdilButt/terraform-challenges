// Check that this machine can run the challenges. Run: node toolkit/check-setup.mjs
// Prints a short table. No line should say FAIL.

import { statfsSync } from 'node:fs';
import { run as docker } from './docker.js';
import { PIN, mode, toolName, tf } from './tf.js';

const rows = [];
const add = (what, ok, detail) => rows.push({ what, status: ok ? 'ok' : 'FAIL', detail });

const major = Number(process.versions.node.split('.')[0]);
add('Node.js 22 or newer', major >= 22, `found ${process.versions.node}`);

const d = docker(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 30_000 });
const dockerOk = d.code === 0 && d.stdout.trim() !== '';
add('Docker engine reachable', dockerOk, dockerOk ? `engine ${d.stdout.trim()}` : 'start Docker, then run this again');

const m = dockerOk || process.env.TFC_MODE === 'local' ? mode() : 'local';
add('Runner mode', true, `${m} (${m === 'docker' ? `${PIN[toolName()].image}` : `${toolName()} on your PATH`})`);

if (dockerOk || m === 'local') {
  const v = tf(['version']);
  const first = v.stdout.split('\n')[0].trim();
  add(`${toolName()} runs`, v.code === 0, v.code === 0 ? first : v.out.split('\n')[0]);
}

try {
  const s = statfsSync('.');
  const gb = (s.bavail * s.bsize) / 1024 ** 3;
  add('2 GB of free disk', gb >= 2, `${gb.toFixed(1)} GB free`);
} catch {
  add('2 GB of free disk', true, 'could not measure, skipped');
}

const w = Math.max(...rows.map((r) => r.what.length));
for (const r of rows) console.log(`${r.what.padEnd(w)}  ${r.status.padEnd(4)}  ${r.detail}`);
process.exit(rows.some((r) => r.status === 'FAIL') ? 1 : 0);
