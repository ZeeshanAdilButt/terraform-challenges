// Challenge 1, part 3: destroy, and what is left.
// Run: node challenges/challenge-1-the-loop/part-3-destroy-and-whats-left/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
//
// It makes three throwaway image names, lets Terraform manage them, destroys, and checks which names and which
// images are still on your machine. alpine:3.23 itself is never managed and never removed.
//   throwaway  an extra tag of alpine:3.23 (docker tag), keep_locally = false
//   kept       an extra tag of alpine:3.23, keep_locally = true (the learner sets this)
//   solo       a tiny image of its own with one name, keep_locally = false

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDocker, cleanup, run as docker } from '../../../toolkit/docker.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { setFact } from '../../../toolkit/facts.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { Recorder } from '../../../toolkit/record.js';
import { applyCounts, mode } from '../../../toolkit/tf.js';
import { N, imageId, section, tfx } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 1, part 3: destroy and what is left');
const opts = (work) => ({ cwd: work, docker: true });

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const ALPINE = 'alpine:3.23';
const OWN = ['tfc-c1-throwaway:1', 'tfc-c1-kept:1', 'tfc-c1-solo:1'];
const SHORT = (ref) => ref.replace('tfc-c1-', '').replace(':1', '');

/** One line per image name: the name, and the first 12 characters of its id or "gone". */
const table = (refs) =>
  refs
    .map((r) => {
      const id = imageId(r);
      return `${r.padEnd(20)} ${id ? id.replace('sha256:', '').slice(0, 12) : 'gone'}`;
    })
    .join('\n');

/** Remove only the three names this part made. Exact names, never alpine, never a prune. */
function removeOwnTags() {
  for (const ref of OWN) {
    if (!ref.startsWith('tfc-c1-')) throw new Error(`refusing to remove ${ref}`);
    if (imageId(ref)) docker(['image', 'rm', ref]);
  }
}

const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });
let applied = false;

try {
  cleanup(N);
  removeOwnTags();

  // Step 1: make the three names. The base image comes from part 1, or is pulled once (4 MB).
  if (!imageId(ALPINE)) docker(['pull', ALPINE], { timeoutMs: 300_000 });
  const alpineBefore = imageId(ALPINE);
  if (!alpineBefore) throw new Error(`${ALPINE} is not on this machine and could not be pulled. Connect to the internet once, then run again.`);
  docker(['tag', ALPINE, 'tfc-c1-throwaway:1']);
  docker(['tag', ALPINE, 'tfc-c1-kept:1']);
  const built = docker(['build', '-q', '-t', 'tfc-c1-solo:1', '-'], { input: `FROM ${ALPINE}\nLABEL tfc.challenge=${N}\nRUN echo tfc-c1-solo > /solo.txt\n` });
  if (built.code !== 0) throw new Error(`could not build the solo image:\n${built.stderr}`);
  const soloId = imageId('tfc-c1-solo:1');
  const before = table([ALPINE, ...OWN]);
  rec.step(
    `docker tag ${ALPINE} tfc-c1-throwaway:1 ; docker tag ${ALPINE} tfc-c1-kept:1 ; docker build -t tfc-c1-solo:1 .   then the image ids`,
    before,
    'throwaway and kept are second names for the same image as alpine:3.23: one id, three names. solo is an image of its own, with a different id and one name.',
  );

  // Step 2: init and apply.
  const init = tfx(['init'], opts(work));
  if (init.code !== 0) throw new Error(`terraform init failed:\n${init.out}`);
  const apply = tfx(['apply', '-auto-approve'], opts(work));
  const ac = applyCounts(apply.out);
  if (!ac) throw new Error(`apply failed:\n${apply.out}`);
  applied = true;
  rec.step('terraform apply -auto-approve   (without the plan text)', section(apply.out, /Creating\.\.\./, 10), 'Terraform now manages three image names. Each already exists locally, so nothing is downloaded.');

  // Step 3: destroy.
  const destroy = tfx(['destroy', '-auto-approve'], opts(work));
  applied = false;
  const dm = /Destroy complete! Resources: (\d+) destroyed/.exec(destroy.out);
  rec.step('terraform destroy -auto-approve   (without the plan text)', section(destroy.out, /Destroying\.\.\./, 10), 'Destroy ran for all three, whatever keep_locally says. keep_locally decides what happens to the image on your machine, not whether the resource is destroyed.');

  // Step 4: what is left.
  const after = table([ALPINE, ...OWN]);
  const present = Object.fromEntries([ALPINE, ...OWN].map((r) => [r, Boolean(imageId(r))]));
  const soloGone = docker(['image', 'inspect', soloId]).code !== 0;
  rec.step(
    'docker image inspect <each name>   (id or gone)',
    after,
    `${present['tfc-c1-throwaway:1'] ? 'throwaway is still here.' : 'throwaway lost its name only: the image behind it is alpine:3.23, which is untouched.'} ${present['tfc-c1-kept:1'] ? 'kept is still here (keep_locally = true).' : 'kept is gone: it had no keep_locally = true.'} ${soloGone ? 'solo is gone, and so is the image: its one name was removed, so Docker deleted the image too.' : 'solo is still here.'}`,
  );

  // Facts.
  setFact('c1.p3.apply_added_count', ac.added);
  setFact('c1.p3.destroy_destroyed_count', dm ? Number(dm[1]) : -1);
  setFact('c1.p3.alpine_id_unchanged', Boolean(alpineBefore) && imageId(ALPINE) === alpineBefore);
  setFact('c1.p3.alpine_present_after', present[ALPINE]);
  setFact('c1.p3.throwaway_present_after', present['tfc-c1-throwaway:1']);
  setFact('c1.p3.kept_present_after', present['tfc-c1-kept:1']);
  setFact('c1.p3.solo_present_after', present['tfc-c1-solo:1']);
  setFact('c1.p3.solo_image_deleted', soloGone);
  setFact('c1.p3.names_removed_count', OWN.filter((r) => !present[r]).length);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, runner mode ${mode()}, Node ${process.versions.node}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Image names still on the machine after destroy (1 = still there)',
        unit: '',
        bars: [ALPINE, ...OWN].map((r) => ({ label: r === ALPINE ? ALPINE : SHORT(r), value: present[r] ? 1 : 0 })),
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c1.p3');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  try {
    if (applied) tfx(['destroy', '-auto-approve'], opts(work));
  } catch {
    /* the sweep below removes the three names */
  }
  removeOwnTags();
  cleanup(N);
}
