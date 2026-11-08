// Step 3 of the pipeline: apply.
// Run: node ci/apply.mjs <folder with the Terraform code> <plan file>
// The plan file was made by ci/plan.mjs and reviewed by a person. This step must apply that plan and nothing else.
// One fault is planted here. The README says what to look for.

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

const dir = resolve(process.argv[2] || '.');
const planFile = process.argv[3];
if (!planFile || !existsSync(join(dir, planFile))) {
  console.error(`apply: there is no plan file "${planFile}" in ${dir}. Run ci/plan.mjs first.`);
  process.exit(2);
}

const { tf } = await import(pathToFileURL(findToolkit()).href);
const args = ['apply', '-auto-approve', '-input=false'];
const r = tf(args, { cwd: dir, docker: true });
console.log(`terraform ${args.join(' ')} ... ${r.code === 0 ? 'ok' : `FAILED (exit ${r.code})`}`);
const lines = r.out.split('\n').map((l) => l.replace(/^[│╷╵]\s?/, '').trimEnd());
if (r.code === 0) {
  console.log(lines.find((l) => l.startsWith('Apply complete')) || '(no summary line)');
} else {
  const first = Math.max(lines.findIndex((l) => l.startsWith('Error:')), 0);
  console.log(lines.slice(first).filter((l) => l.trim()).slice(0, 12).join('\n'));
}
process.exit(r.code);
