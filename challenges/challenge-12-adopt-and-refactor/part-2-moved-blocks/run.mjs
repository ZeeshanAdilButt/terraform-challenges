// Challenge 12, part 2: rename and move resources with moved blocks, and zero destroys.
// Run: node challenges/challenge-12-adopt-and-refactor/part-2-moved-blocks/run.mjs
// Add --record to also write results.md and chart.svg next to this file (the reference run does).
//
// It applies the OLD code (everything at the top level), then plans the REFACTORED code (a module, new names):
// first without moved blocks (what happens when nobody tells Terraform), then with yours.
// Your files are applied only when the plan destroys nothing.

import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { versionLine } from '../../../toolkit/tf.js';
import { assertDocker, cleanup } from '../../../toolkit/docker.js';
import { prepareWork, partDir, recording } from '../../../toolkit/part.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, WEB, CACHE, NET, tfx, grep, containerId, startedAt, listObjects, copyTf, read, counts, applied, applyLegacy , cleanAll, run } from '../lib.mjs';

const here = partDir(import.meta.url);
const rec = new Recorder('Challenge 12, part 2: moved blocks');
const short = (id) => id.slice(0, 12);
const movedLines = (text) => (text.match(/has moved to|\(moved from/g) || []).length;

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

let failed = false;
try {
  cleanup(N);
  const work = prepareWork(import.meta.url);

  // Step 1: the old code builds the stack.
  const legacy = applyLegacy(here, work);
  const state0 = tfx(['state', 'list'], join(work, 'legacy'));
  rec.step(
    'terraform apply   (the OLD code: before/main.tf, three resources at the top level)',
    `${grep(legacy.out, /^Apply complete|^Error/, 3)}\n${state0.out.trim()}`,
    'This is the stack that exists. Its state knows the three old addresses.',
  );
  if (legacy.code !== 0) throw new Error(`The old code did not apply:\n${legacy.out}`);
  const old = { web: containerId(WEB), cache: containerId(CACHE), webStart: startedAt(WEB), cacheStart: startedAt(CACHE) };

  // Keep a copy of the old state and the new code for "a teammate who has not applied yet".
  const mate = join(work, 'teammate');
  copyTf(work, mate, { skip: ['moves.tf'] });
  mkdirSync(join(mate, 'modules', 'app'), { recursive: true });
  copyFileSync(join(work, 'modules', 'app', 'main.tf'), join(mate, 'modules', 'app', 'main.tf'));
  copyFileSync(join(work, 'terraform.tfstate'), join(mate, 'terraform.tfstate'));

  // Step 2: init the refactored code.
  const init = tfx(['init'], work);
  rec.step('terraform init   (the REFACTORED code: a module, new names)', grep(init.out, /Initializing modules|Installing|successfully initialized|Error/), 'The code now has module "app". The state does not know that yet.');

  // Step 3: plan without moved blocks.
  const hasMoves = existsSync(join(work, 'moves.tf'));
  if (hasMoves) renameSync(join(work, 'moves.tf'), join(work, 'moves.tf.off'));
  const bare = tfx(['plan'], work);
  const bc = counts(bare.out);
  rec.step(
    'terraform plan   (no moved blocks)',
    grep(bare.out, /will be created|will be destroyed|is not in configuration|^Plan:/, 16),
    'Terraform sees three addresses it has never heard of and three in the state that the code no longer mentions. For Terraform that is: build three new things, destroy three old ones.',
  );
  setFact('c12.p2.no_moved_plan_add_count', bc?.add ?? -1);
  setFact('c12.p2.no_moved_plan_destroy_count', bc?.destroy ?? -1);
  if (hasMoves) renameSync(join(work, 'moves.tf.off'), join(work, 'moves.tf'));

  // Step 4: plan with the learner's moved blocks.
  const plan = tfx(['plan'], work);
  const pc = counts(plan.out);
  rec.step(
    'terraform plan   (your moves.tf)',
    grep(plan.out, /has moved to|moved from|will be created|will be destroyed|will be updated|^Plan:|^Error|^Warning/, 14),
    'The plan to aim for: every object is "moved", nothing is added, nothing is destroyed.',
  );
  setFact('c12.p2.plan_add_count', pc?.add ?? -1);
  setFact('c12.p2.plan_change_count', pc?.change ?? -1);
  setFact('c12.p2.plan_destroy_count', pc?.destroy ?? -1);
  setFact('c12.p2.plan_moved_count', (plan.out.match(/# .* has moved to |# .*\(moved from /g) || []).length);

  if (!pc || pc.destroy > 0 || pc.add > 0) {
    failed = true;
    console.log(`\nStopping before apply: this plan would add ${pc?.add ?? '?'} and destroy ${pc?.destroy ?? '?'} objects.`);
    console.log('Add one moved block per resource to moves.tf, then run this again.');
  } else {
    // Step 5: apply.
    const apply = tfx(['apply', '-auto-approve'], work);
    const ac = applied(apply.out);
    rec.step('terraform apply -auto-approve', grep(apply.out, /Creating|Destroying|Modifying|^Apply complete|^Error/, 10) || '(no resource lines)', 'A move is a change to the state only. Docker is not asked to do anything.');
    setFact('c12.p2.apply_added_count', ac?.added ?? -1);
    setFact('c12.p2.apply_changed_count', ac?.changed ?? -1);
    setFact('c12.p2.apply_destroyed_count', ac?.destroyed ?? -1);

    // Step 6: same containers?
    const now = { web: containerId(WEB), cache: containerId(CACHE), webStart: startedAt(WEB), cacheStart: startedAt(CACHE) };
    rec.step(
      'docker inspect (id and StartedAt, before and after the refactor)',
      `web    id ${short(old.web)} -> ${short(now.web)}   started ${old.webStart} -> ${now.webStart}\ncache  id ${short(old.cache)} -> ${short(now.cache)}   started ${old.cacheStart} -> ${now.cacheStart}`,
      'Same ids, same start times: nothing was recreated.',
    );
    setFact('c12.p2.container_ids_kept_count', Number(old.web === now.web) + Number(old.cache === now.cache));
    setFact('c12.p2.container_restarts_count', 2 - (Number(old.webStart === now.webStart) + Number(old.cacheStart === now.cacheStart)));

    // Step 7: the state under the new addresses, and a clean plan.
    const list = tfx(['state', 'list'], work);
    const again = tfx(['plan'], work);
    rec.step('terraform state list ; terraform plan', `${list.out.trim()}\n${grep(again.out, /No changes|^Plan:|Error/, 3)}`, 'The state has the new addresses. The plan is clean.');
    setFact('c12.p2.second_plan_no_changes', /No changes\./.test(again.out));
    setFact('c12.p2.state_module_resources_count', list.out.split('\n').filter((l) => l.startsWith('module.app.')).length);

    // Step 8: delete the moved blocks. Fine for this state.
    renameSync(join(work, 'moves.tf'), join(work, 'moves.tf.off'));
    const clean = tfx(['plan'], work);
    rec.step('terraform plan   (moves.tf taken away after the apply)', grep(clean.out, /No changes|^Plan:|Error/, 3), 'For a state that has already applied the move, the blocks are no longer needed.');
    setFact('c12.p2.plan_without_moves_after_apply_no_changes', /No changes\./.test(clean.out));

    // Step 9: a teammate who still has the OLD state and now pulls code without moved blocks.
    tfx(['init'], mate);
    const mp = tfx(['plan'], mate);
    const mc = counts(mp.out);
    rec.step(
      'terraform plan   (a teammate: old state, new code, no moved blocks)',
      grep(mp.out, /will be created|will be destroyed|^Plan:/, 10),
      'Taking the moved blocks away is a breaking change for every state that has not applied them yet.',
    );
    setFact('c12.p2.teammate_plan_add_count', mc?.add ?? -1);
    setFact('c12.p2.teammate_plan_destroy_count', mc?.destroy ?? -1);

    // Step 10: the teammate applies it anyway.
    const ma = tfx(['apply', '-auto-approve'], mate);
    const left = run(['ps', '--filter', `label=tfc.challenge=${N}`, '--format', '{{.Names}}']).stdout.trim().split('\n').filter(Boolean);
    rec.step(
      'terraform apply -auto-approve   (the teammate) ; docker ps',
      `${grep(ma.out, /Destroying\.\.\.|Destruction complete|Creating\.\.\.|^Error|already exists|^Apply complete/, 12)}\ncontainers still running: ${left.length}`,
      'The old containers are gone. Terraform destroyed them while it tried to create the same names again.',
    );
    setFact('c12.p2.teammate_apply_containers_left_count', left.length);
    setFact('c12.p2.teammate_apply_error', /already exists/.test(ma.out) ? (/network with name tfc-c12-net already exists/.test(ma.out) ? 'network with name tfc-c12-net already exists' : 'already exists') : 'no error');

    if (recording()) {
      writeFileSync(
        join(here, 'chart.svg'),
        barsSvg({
          title: 'Objects the plan would destroy after the refactor',
          unit: 'destroyed',
          bars: [
            { label: 'no moved blocks', value: bc?.destroy ?? 0 },
            { label: 'with moved blocks', value: pc?.destroy ?? 0 },
          ],
        }),
      );
    }
  }
} finally {
  const { removed, left } = cleanAll();
  console.log(`\nCleanup: removed ${removed.containers.length} containers and ${removed.networks.length} networks; left ${left.containers + left.networks + left.volumes}.`);
  if (recording() && !failed) rec.write(join(here, 'results.md'), `Windows 11, Docker Desktop, Engine ${engine}, ${versionLine()} (${process.env.TFC_MODE || 'auto'} mode), Node ${process.versions.node}`);
}
process.exit(failed ? 1 : 0);
