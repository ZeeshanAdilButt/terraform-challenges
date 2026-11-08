// Shared helpers for challenge 4. Plain Node, no npm packages.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tf } from '../../toolkit/tf.js';
import { useReference } from '../../toolkit/part.js';

export const N = 4;

/** Remove colour codes (a few commands, such as `terraform graph`, print them when they fail). */
export const clean = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, '');

/**
 * Run `terraform init` (or another args list) and try again when the shared plugin cache was busy.
 * Several runs on one machine can install the same provider at once; the second one sometimes fails with
 * "Failed to install provider" or "no version is selected". Waiting and repeating is the fix.
 */
export function initRetry(cwd, args = ['init'], tries = 4) {
  let r;
  for (let i = 0; i < tries; i += 1) {
    r = tf(args, { cwd });
    if (r.code === 0) return r;
    if (!/Failed to install provider|no version is selected|Inconsistent dependency lock file|text file busy|Required plugins are not installed/.test(r.out)) return r;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }
  return r;
}

/** Read a file of a part: the learner's file, or the reference file when TFC_REFERENCE=1 or --reference. */
export function partFile(metaUrl, rel) {
  const dir = dirname(fileURLToPath(metaUrl));
  const ref = join(dir, 'reference', rel);
  if (useReference() && existsSync(ref)) return readFileSync(ref, 'utf8');
  const own = join(dir, rel);
  return existsSync(own) ? readFileSync(own, 'utf8') : '';
}

/** What a .terraform.lock.hcl says about one provider: version, constraints, and the number of h1 and zh hashes. */
export function lockInfo(text, source = 'hashicorp/local') {
  const start = text.indexOf(`provider "registry.terraform.io/${source}"`);
  if (start < 0) return null;
  const block = text.slice(start, text.indexOf('\n}\n', start));
  const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(block)?.[1] ?? null;
  const constraints = /^\s*constraints\s*=\s*"([^"]+)"/m.exec(block)?.[1] ?? null;
  return {
    version,
    constraints,
    h1: (block.match(/"h1:/g) || []).length,
    zh: (block.match(/"zh:/g) || []).length,
  };
}

/** Edges of `terraform graph` output: { from, to } means "from needs to" (to is built first). */
export function parseGraph(dot) {
  return [...clean(dot).matchAll(/"([^"]+)" -> "([^"]+)"/g)].map((m) => ({ from: m[1], to: m[2] }));
}

/** The order of the "Creating..." / "Creation complete" (and Destroying, Reading) lines of an apply: [{ addr, event }]. */
export function applyEvents(out) {
  const events = [];
  for (const line of out.split('\n')) {
    const m = /^(\S+): (Creating|Creation complete|Destroying|Destruction complete|Reading|Read complete)\b/.exec(line);
    if (m) events.push({ addr: m[1], event: m[2] === 'Creating' || m[2] === 'Destroying' || m[2] === 'Reading' ? 'start' : 'done' });
  }
  return events;
}

/** Index of the event in the list, or -1. */
export const at = (events, addr, event) => events.findIndex((e) => e.addr === addr && e.event === event);

// Another run on the machine may be writing the shared plugin cache at the same moment. A command can then fail
// with one of these messages. Starting it again after a short wait is the fix.
const CACHE_RACE = /Failed to install provider|no version is selected|Inconsistent dependency lock file|text file busy|Required plugins are not installed|does not match any of the checksums/;

/** Run tf(args, opts); when the answer is a plugin cache race, initialise the folder again and repeat. */
export function tfRetry(args, opts = {}, tries = 6) {
  let r;
  for (let i = 0; i < tries; i += 1) {
    r = tf(args, opts);
    if (r.code === 0 || !CACHE_RACE.test(r.out)) return r;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    rmSync(join(opts.cwd, '.terraform'), { recursive: true, force: true });
    rmSync(join(opts.cwd, '.terraform.lock.hcl'), { force: true });
    initRetry(opts.cwd);
  }
  return r;
}
