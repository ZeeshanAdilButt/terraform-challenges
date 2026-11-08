// Small helpers the three parts of challenge 1 share. Plain Node, no npm packages.

import { run } from '../../toolkit/docker.js';
import { tf } from '../../toolkit/tf.js';

export const N = 1;

/** The lines of a plan that name a resource and its action, plus the summary line. Keeps a recorded step short. */
export function planSummary(out) {
  const keep = out
    .split('\n')
    .filter((l) => /^  # /.test(l) || /forces replacement/.test(l) || /^Plan:/.test(l) || /^No changes/.test(l) || /^Error/.test(l) || /^│ /.test(l));
  return keep.join('\n');
}

/** Addresses of the resources a plan touches, in order, for example ["random_pet.name", "local_file.greeting"]. */
export function touched(out) {
  return [...out.matchAll(/^  # (\S+) (?:will be|must be)/gm)].map((m) => m[1]);
}

/** Keep the lines from the first line that matches `from`, at most `max` lines. */
export function section(text, from, max = 25) {
  const lines = text.trimEnd().split('\n');
  const i = Math.max(0, lines.findIndex((l) => from.test(l)));
  return lines.slice(i, i + max).join('\n');
}

/** True when `docker image inspect <ref>` finds the image. */
export const imageExists = (ref) => run(['image', 'inspect', '--format', '{{.Id}}', ref]).code === 0;

/** The image id (sha256:...) of a reference, or '' when it is not on this machine. */
export const imageId = (ref) => run(['image', 'inspect', '--format', '{{.Id}}', ref]).stdout.trim();

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
