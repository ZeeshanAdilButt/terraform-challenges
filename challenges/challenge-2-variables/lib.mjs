// Small helpers the two parts of challenge 2 share. Plain Node, no npm packages.

import { tf } from '../../toolkit/tf.js';

export const N = 2;

const TRANSIENT = /text file busy|Required plugins are not installed|does not match any of the checksums|Failed to install provider|Failed to load plugin schemas|Failed to obtain provider schema/;
const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * tf() with a retry for the one hiccup that is not your fault: the shared plugin cache is being rewritten by
 * another run (text file busy, a checksum that does not match for a moment). It waits, runs init again, and
 * repeats the command, up to four tries. Any other failure is returned at once.
 */
export function tfx(args, opts = {}) {
  for (let i = 1; ; i++) {
    const r = tf(args, opts);
    if (r.code === 0 || i >= 4 || !TRANSIENT.test(r.out)) return r;
    nap(5000);
    if (args[0] !== 'init') tf(['init'], opts);
  }
}

/** Keep the lines from the first line that matches `from`, at most `max` lines. */
export function section(text, from, max = 25) {
  const lines = text.trimEnd().split('\n');
  const i = Math.max(0, lines.findIndex((l) => from.test(l)));
  return lines.slice(i, i + max).join('\n');
}

/** An error block: from the "Error:" line to the last non-empty line, blank lines squeezed, at most `max` lines. */
export function errorBlock(text, max = 14) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex((l) => /^Error:/.test(l));
  if (i < 0) return '(no error)';
  const out = [];
  for (const l of lines.slice(i)) {
    if (l.trim() === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(l.trimEnd());
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.slice(0, max).join('\n');
}
