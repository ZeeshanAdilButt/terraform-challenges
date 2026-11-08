// Helpers shared by the parts of challenge 9. Plain Node, no npm packages.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tf, tfAsync } from '../../toolkit/tf.js';
import { getFact, setFact } from '../../toolkit/facts.js';

export const N = 9;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * terraform init. Several challenges share one provider cache, so a parallel install can answer "text file busy".
 * That is not your fault: wait a moment and run init again.
 */
export async function init(cwd, args = []) {
  let r;
  for (let i = 0; i < 5; i += 1) {
    r = await tfAsync(['init', ...args], { cwd, docker: true });
    if (r.code === 0 || !FLAKY.test(r.out)) return r;
    await sleep(5000);
  }
  return r;
}

/** Keep at most max lines of text. Drops blank runs. A line "..." marks what was left out. */
export function short(text, max = 25) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n').filter((l, i, a) => !(l.trim() === '' && (i === 0 || a[i - 1].trim() === '')));
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length <= max) return lines.join('\n');
  return [...lines.slice(0, max - 1), '...'].join('\n');
}

/** Lines of text that match a regular expression, in order. */
export function grep(text, re) {
  return String(text).split('\n').filter((l) => re.test(l));
}

/** The first Terraform error message in text: from the "Error:" line, at most max lines, no blank lines. */
export function errorBlock(text, max = 14) {
  return short(from(text, /^Error/).split('\n').filter((l) => l.trim() !== '').join('\n'), max);
}

/** First line of text that matches, trimmed, or '' when none does. */
export function firstMatch(text, re) {
  return (grep(text, re)[0] || '').trim();
}

/** Everything from the first line that matches `from` on. */
export function from(text, re) {
  const lines = String(text).split('\n');
  const i = lines.findIndex((l) => re.test(l));
  return i < 0 ? '' : lines.slice(i).join('\n');
}

/** Run terraform in a folder with the Docker provider mounted. Blocking: do not use next to a state server. */
const FLAKY = /text file busy|Required plugins are not installed|Inconsistent dependency lock file|does not match any of the checksums|failed to install provider|Failed to install provider/;

/**
 * Run terraform in a folder with the Docker provider mounted. Blocking: do not use next to a state server.
 * The plugin cache is shared with other challenges. When a parallel install disturbs it, init again and retry.
 */
export function run(args, cwd, env) {
  let r = tf(args, { cwd, docker: true, env });
  for (let i = 0; i < 3 && r.code !== 0 && FLAKY.test(r.out) && args[0] !== 'init'; i += 1) {
    tf(['init'], { cwd, docker: true });
    r = tf(args, { cwd, docker: true, env });
  }
  return r;
}

export function removeTree(path) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

export { readdirSync, join };

/** Parse the JSON a finished terraform run printed. Throws with the real output when the run failed. */
export function parse(r, what) {
  if (r.code !== 0) throw new Error(`${what} failed (exit ${r.code}):\n${r.out.split('\n').slice(0, 12).join('\n')}`);
  return JSON.parse(r.stdout);
}

/**
 * Save facts to facts.json. Other challenges write the same file at the same time, and a write can be lost,
 * so read the values back and write again until they are all there.
 */
export function saveFacts(prefix, facts) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    for (const [k, v] of Object.entries(facts)) setFact(`${prefix}.${k}`, v);
    if (Object.entries(facts).every(([k, v]) => getFact(`${prefix}.${k}`) === v)) return;
  }
  throw new Error(`Could not save the facts ${prefix}.*`);
}

/** Same as run(), for folders that do not use the Docker provider: no Docker socket is mounted. */
export function runPlain(args, cwd, env) {
  let r = tf(args, { cwd, env });
  for (let i = 0; i < 3 && r.code !== 0 && FLAKY.test(r.out) && args[0] !== 'init'; i += 1) {
    tf(['init'], { cwd });
    r = tf(args, { cwd, env });
  }
  return r;
}

/** terraform init without the Docker socket. */
export async function initPlain(cwd, args = []) {
  let r;
  for (let i = 0; i < 5; i += 1) {
    r = await tfAsync(['init', ...args], { cwd });
    if (r.code === 0 || !FLAKY.test(r.out)) return r;
    await sleep(5000);
  }
  return r;
}
