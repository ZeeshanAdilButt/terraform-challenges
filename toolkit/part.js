// Helpers every challenge part uses. Plain Node, no npm packages.
//
// A part folder holds the files the learner edits (starter files) and a reference/ folder with the solution.
// run.mjs never works inside the part folder. It copies the files to work/ (ignored by Git) and runs
// Terraform there, so state and .terraform never mix with the files you edit.
//
//   const work = prepareWork(import.meta.url);   // fresh work/ folder with your files (or the reference files)
//
// The reference files are used when you pass --reference or set TFC_REFERENCE=1. The tests of a part
// must fail on the starter and pass on the reference.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NOT_COPIED = new Set(['README.md', 'run.mjs', 'test.mjs', 'results.md', 'chart.svg', 'reference', 'work', 'NOTES.md']);

export function partDir(metaUrl) {
  return dirname(fileURLToPath(metaUrl));
}

export function useReference() {
  return process.env.TFC_REFERENCE === '1' || process.argv.includes('--reference');
}

/** Recreate dir/work from the starter files, then overlay reference/ when using the reference. Returns the work path. */
export function prepareWork(metaUrl, { keep = [] } = {}) {
  const dir = partDir(metaUrl);
  const work = join(dir, 'work');
  const kept = {};
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (NOT_COPIED.has(name) || keep.includes(name) === false && name.startsWith('.')) continue;
    cpSync(join(dir, name), join(work, name), { recursive: true });
  }
  if (useReference() && existsSync(join(dir, 'reference'))) {
    cpSync(join(dir, 'reference'), work, { recursive: true });
  }
  return work;
}

/** True when --record is on the command line: run.mjs then writes results.md and chart.svg. */
export const recording = () => process.argv.includes('--record');

/** The work folder of a part, for tests that need to look at what run.mjs left behind (call run.mjs first). */
export function workDir(metaUrl) {
  const w = join(partDir(metaUrl), 'work');
  return existsSync(w) && statSync(w).isDirectory() ? w : null;
}
