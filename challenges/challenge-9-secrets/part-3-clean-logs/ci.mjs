// The CI wrapper. Fails the build when a secret is found in the run output or in the files a build keeps.
//
//   node ci.mjs --secret-env API_TOKEN <file> [<file> ...]
//
// --secret-env NAME   an environment variable that holds a secret (repeat it for more secrets)
// <file>              a file to scan: the saved plan output, the apply output, terraform.tfstate, a plan JSON ...
//
// Exit code 0: nothing found. 1: a secret was found. 2: bad usage. It never prints a secret, only where it found one.

import { existsSync, readFileSync } from 'node:fs';
import { findSecrets } from './scan.mjs';

const args = process.argv.slice(2);
const names = [];
const files = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--secret-env') names.push(args[(i += 1)]);
  else files.push(args[i]);
}
if (names.length === 0 || files.length === 0) {
  console.error('usage: node ci.mjs --secret-env NAME [--secret-env NAME ...] <file> [<file> ...]');
  process.exit(2);
}
const secrets = names.map((n) => process.env[n] ?? '');
const missing = names.filter((n, i) => secrets[i].length === 0);
if (missing.length > 0) {
  console.error(`ci: no value in ${missing.join(', ')}. A scanner with nothing to look for would pass every build.`);
  process.exit(2);
}

let leaks = 0;
for (const file of files) {
  if (!existsSync(file)) {
    console.log(`ci: ${file}: not found, skipped`);
    continue;
  }
  const found = findSecrets(readFileSync(file, 'utf8'), secrets);
  for (const f of found) console.log(`LEAK: ${file}:${f.line}: ${names[f.secret]} found as ${f.form}`);
  leaks += found.length;
}
if (leaks > 0) {
  console.log(`ci: build failed, ${leaks} place(s) hold a secret.`);
  process.exit(1);
}
console.log(`ci: ok, ${files.length} file(s) scanned, no secret found.`);
