// Step 1 of the pipeline: make the plan and save it.
// Run: node ci/plan.mjs <folder with the Terraform code>
// Writes <folder>/plan.tfplan (the plan file) and <folder>/plan.json (the same plan as JSON, for scripts).
// This script is finished. You do not need to change it.

import { existsSync, writeFileSync } from 'node:fs';
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
const { tf } = await import(pathToFileURL(findToolkit()).href);
const run = (args) => tf(args, { cwd: dir, docker: true });

for (const args of [['init', '-input=false'], ['plan', '-input=false', '-out=plan.tfplan']]) {
  const r = run(args);
  console.log(`terraform ${args.join(' ')} ... ${r.code === 0 ? 'ok' : `FAILED (exit ${r.code})`}`);
  if (r.code !== 0) {
    console.log(r.out);
    process.exit(1);
  }
  if (args[0] === 'plan') console.log(r.out.split('\n').filter((l) => /^Plan:|^No changes/.test(l)).join('\n'));
}
const shown = run(['show', '-json', 'plan.tfplan']);
if (shown.code !== 0) {
  console.log(shown.out);
  process.exit(1);
}
writeFileSync(join(dir, 'plan.json'), shown.stdout);
console.log('Wrote plan.tfplan and plan.json');
