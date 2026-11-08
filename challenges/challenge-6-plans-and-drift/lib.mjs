// Shared helpers for challenge 6. Plain Node, no npm packages.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tf, tfAsync } from '../../toolkit/tf.js';
import { useReference } from '../../toolkit/part.js';

export const N = 6;

/** Remove colour codes (a few commands, such as `force-unlock`, print them). */
export const clean = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, '');

/** The output without colour, carriage returns or blank lines, as a list of lines. */
export const lines = (out) => clean(out).replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).filter(Boolean);

/** The lines of an output that match a regular expression, joined. */
export const pick = (out, re) => lines(out).filter((l) => re.test(l)).join('\n');

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Several runs on one machine can write the shared plugin cache at the same moment. The second one then fails
// with one of these messages. Waiting a little and starting again is the fix.
const CACHE_RACE = /Failed to install provider|no version is selected|Inconsistent dependency lock file|text file busy|Required plugins are not installed|does not match any of the checksums|fatal error: |goroutine 1 \[/;

/** Run `terraform init` (or another init args list) in cwd; try again when the plugin cache was busy. */
export function initRetry(cwd, args = ['init'], opts = {}, tries = 8) {
  let r;
  for (let i = 0; i < tries; i += 1) {
    r = tf(args, { cwd, ...opts });
    if (r.code === 0) return r;
    if (!CACHE_RACE.test(r.out)) return r;
    rmSync(join(cwd, '.terraform'), { recursive: true, force: true });
    rmSync(join(cwd, '.terraform.lock.hcl'), { force: true });
    sleepSync(5000);
  }
  return r;
}

/** Run tf(args); when the answer is a plugin cache race, initialise again and repeat. */
export function tfRetry(args, opts = {}, tries = 6) {
  const { initArgs = ['init'], ...rest } = opts;
  let r;
  for (let i = 0; i < tries; i += 1) {
    r = tf(args, rest);
    if (r.code === 0 || !CACHE_RACE.test(r.out)) return r;
    rmSync(join(rest.cwd, '.terraform'), { recursive: true, force: true });
    rmSync(join(rest.cwd, '.terraform.lock.hcl'), { force: true });
    sleepSync(5000);
    initRetry(rest.cwd, initArgs, { docker: rest.docker });
  }
  return r;
}

/** Same, without blocking the event loop (use it whenever a state server runs in this process). */
export async function tfAsyncRetry(args, opts = {}, tries = 6) {
  const { initArgs = ['init'], ...rest } = opts;
  let r;
  for (let i = 0; i < tries; i += 1) {
    r = await tfAsync(args, rest);
    if (r.code === 0 || !CACHE_RACE.test(r.out)) return r;
    rmSync(join(rest.cwd, '.terraform'), { recursive: true, force: true });
    rmSync(join(rest.cwd, '.terraform.lock.hcl'), { force: true });
    await sleep(5000);
    await tfAsync(initArgs, { cwd: rest.cwd, docker: rest.docker });
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

/** The numbers of a plan: { add, change, destroy, none } (none is true for "No changes"). */
export function planSummary(out) {
  const t = clean(out);
  const m = /Plan: (\d+) to add, (\d+) to change, (\d+) to destroy/.exec(t);
  if (m) return { add: +m[1], change: +m[2], destroy: +m[3], none: false };
  return { add: 0, change: 0, destroy: 0, none: /No changes\. Your infrastructure matches the configuration/.test(t) };
}

/** serial and lineage of a state file, and the resource addresses it holds. */
export function stateInfo(path) {
  if (!existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const addrs = (j.resources || []).flatMap((r) => (r.instances || []).map((i) => `${r.mode === 'data' ? 'data.' : ''}${r.type}.${r.name}${i.index_key !== undefined ? `[${JSON.stringify(i.index_key)}]` : ''}`));
  return { serial: j.serial, lineage: j.lineage, resources: addrs };
}

/** Same as initRetry, without blocking the event loop (use it whenever a state server runs in this process). */
export async function initAsync(cwd, args = ['init'], opts = {}, tries = 8) {
  let r;
  for (let i = 0; i < tries; i += 1) {
    r = await tfAsync(args, { cwd, ...opts });
    if (r.code === 0) return r;
    if (!CACHE_RACE.test(r.out)) return r;
    rmSync(join(cwd, '.terraform'), { recursive: true, force: true });
    rmSync(join(cwd, '.terraform.lock.hcl'), { force: true });
    await sleep(5000);
  }
  return r;
}

/** The entries of a zip file (a saved plan is one): [{ name, data }]. Reads the central directory, inflates with zlib. */
export function zipEntries(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e -= 1;
  if (e < 0) throw new Error('not a zip file');
  const n = buf.readUInt16LE(e + 10);
  let o = buf.readUInt32LE(e + 16);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const method = buf.readUInt16LE(o + 10);
    const csize = buf.readUInt32LE(o + 20);
    const nlen = buf.readUInt16LE(o + 28);
    const xlen = buf.readUInt16LE(o + 30);
    const clen = buf.readUInt16LE(o + 32);
    const lo = buf.readUInt32LE(o + 42);
    const name = buf.toString('utf8', o + 46, o + 46 + nlen);
    const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    const data = buf.subarray(start, start + csize);
    out.push({ name, data: method === 0 ? data : inflateRawSync(data) });
    o += 46 + nlen + xlen + clen;
  }
  return out;
}
