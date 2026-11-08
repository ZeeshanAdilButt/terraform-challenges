// Challenge 12, part 3: stop managing a resource without destroying it (removed blocks and state rm).
// Run: node challenges/challenge-12-adopt-and-refactor/part-3-removed-blocks/run.mjs
// Add --record to also write results.md and chart.svg next to this file (the reference run does).
//
// It applies the old code (net, web, cache), then plans the code where the cache block was deleted:
// first with nothing else (the plan destroys the cache), then with a removed block that forgets to say
// destroy = false, then with yours. Your files are applied only when the plan destroys nothing.
// Last it tries the older way, `terraform state rm`, on the web container, and shows its trap.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { versionLine } from '../../../toolkit/tf.js';
import { assertDocker, cleanup } from '../../../toolkit/docker.js';
import { prepareWork, partDir, recording } from '../../../toolkit/part.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, WEB, CACHE, tfx, grep, containerId, startedAt, isRunning, copyTf, read, counts, applied, applyLegacy , cleanAll, run } from '../lib.mjs';

const here = partDir(import.meta.url);
const rec = new Recorder('Challenge 12, part 3: removed blocks and state rm');
const short = (id) => id.slice(0, 12);
const running = () => run(['ps', '--filter', `label=tfc.challenge=${N}`, '--format', '{{.Names}}']).stdout.trim().split('\n').filter(Boolean).sort();

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
  if (legacy.code !== 0) throw new Error(`The old code did not apply:\n${legacy.out}`);
  const state0 = tfx(['state', 'list'], join(work, 'legacy'));
  rec.step(
    'terraform apply   (the OLD code: before/main.tf, network, web and cache)',
    `${grep(legacy.out, /^Apply complete|^Error/, 3)}\n${state0.out.trim()}`,
    'Three objects exist and all three are in the state.',
  );
  const before = { web: containerId(WEB), cache: containerId(CACHE), cacheStart: startedAt(CACHE) };

  // Step 2: init, and plan with the cache block simply gone.
  const init = tfx(['init'], work);
  const hasRemoved = read(join(work, 'removed.tf')).trim() !== '';
  renameSync(join(work, 'removed.tf'), join(work, 'removed.tf.off'));
  const bare = tfx(['plan'], work);
  const bc = counts(bare.out);
  rec.step(
    'terraform plan   (main.tf without the cache block, no removed block)',
    grep(bare.out, /will be destroyed|is not in configuration|^Plan:|^Error/, 8),
    'Deleting a block is a request to destroy the object. That is what Terraform has always done, and a removed block must be deliberate about it.',
  );
  setFact('c12.p3.no_removed_plan_destroy_count', bc?.destroy ?? -1);

  // Step 3: a removed block without the lifecycle part.
  writeFileSync(join(work, 'removed.tf'), 'removed {\n  from = docker_container.cache\n}\n');
  const plain = tfx(['plan'], work);
  const plc = counts(plain.out);
  rec.step(
    'terraform plan   (removed { from = docker_container.cache } and nothing else)',
    grep(plain.out, /will be destroyed|is not in configuration|^Plan:|^Error/, 8),
    'A removed block on its own still destroys. The safe part is the lifecycle block with destroy = false.',
  );
  setFact('c12.p3.removed_without_lifecycle_plan_destroy_count', plc?.destroy ?? -1);
  renameSync(join(work, 'removed.tf.off'), join(work, 'removed.tf'));

  // Step 4: the learner's removed.tf.
  const plan = tfx(['plan'], work);
  const pc = counts(plan.out);
  rec.step(
    'terraform plan   (your removed.tf)',
    grep(plan.out, /will no longer be managed|will be destroyed|^Plan:|^Warning|^ - docker_container|^Error/, 12),
    'The plan to aim for: nothing to add, change or destroy, and a warning that one object will stop being tracked.',
  );
  setFact('c12.p3.plan_add_count', pc?.add ?? -1);
  setFact('c12.p3.plan_change_count', pc?.change ?? -1);
  setFact('c12.p3.plan_destroy_count', pc?.destroy ?? -1);
  setFact('c12.p3.plan_forgotten_count', (plan.out.match(/will no longer be managed by Terraform, but will not be destroyed/g) || []).length);

  if (!pc || pc.destroy > 0 || pc.add > 0 || !hasRemoved) {
    failed = true;
    console.log(`\nStopping before apply: this plan would add ${pc?.add ?? '?'} and destroy ${pc?.destroy ?? '?'} objects.`);
    console.log('Write a removed block with lifecycle { destroy = false } in removed.tf, then run this again.');
  } else {
    // Step 5: apply, and look at Docker and the state.
    const apply = tfx(['apply', '-auto-approve'], work);
    const ac = applied(apply.out);
    const state = tfx(['state', 'list'], work).out.trim();
    rec.step(
      'terraform apply -auto-approve ; terraform state list ; docker ps',
      `${grep(apply.out, /^Apply complete|^Error|Destroying/, 4)}\n${state}\ndocker ps: ${running().join(' ')}`,
      'The cache container is gone from the state and still runs. Terraform will never touch it again, unless you import it.',
    );
    setFact('c12.p3.apply_destroyed_count', ac?.destroyed ?? -1);
    setFact('c12.p3.cache_still_running', isRunning(CACHE));
    setFact('c12.p3.cache_same_id', containerId(CACHE) === before.cache && startedAt(CACHE) === before.cacheStart);
    setFact('c12.p3.state_resources_count', state.split('\n').filter(Boolean).length);
    setFact('c12.p3.cache_in_state', /docker_container\.cache/.test(state));

    const again = tfx(['plan'], work);
    rec.step('terraform plan', grep(again.out, /No changes|^Plan:|^Error/, 3), 'The removed block has done its work.');
    setFact('c12.p3.second_plan_no_changes', /No changes\./.test(again.out));

    // Step 6: the older way, state rm, with the block still in the code.
    const rm = tfx(['state', 'rm', 'docker_container.web'], work);
    const rmPlan = tfx(['plan'], work);
    const rc = counts(rmPlan.out);
    rec.step(
      'terraform state rm docker_container.web ; terraform plan',
      `${rm.out.trim()}\n${grep(rmPlan.out, /will be created|^Plan:/, 4)}`,
      'state rm forgets the object at once, with no plan and no record in the code. The block is still in main.tf, so Terraform now wants to create a container that already exists.',
    );
    setFact('c12.p3.state_rm_plan_add_count', rc?.add ?? -1);

    const clash = tfx(['apply', '-auto-approve'], work);
    rec.step(
      'terraform apply -auto-approve',
      grep(clash.out, /^Error|already in use|Creating\.\.\./, 6),
      'The name is taken by the container Terraform just forgot. The apply fails and changes nothing. With state rm the code must be changed too, in the same pull request.',
    );
    setFact('c12.p3.state_rm_apply_error', /already in use/.test(clash.out) ? 'container name is already in use' : 'no error');
    setFact('c12.p3.state_rm_apply_ok', clash.code === 0);

    // Step 7: take the block out of the code as well.
    const main = readFileSync(join(work, 'main.tf'), 'utf8');
    writeFileSync(join(work, 'main.tf'), main.slice(0, main.indexOf('resource "docker_container" "web"')).trimEnd() + '\n');
    const done = tfx(['plan'], work);
    rec.step(
      'terraform plan   (the web block deleted from main.tf as well)',
      `${grep(done.out, /No changes|^Plan:|^Error/, 3)}\ndocker ps: ${running().join(' ')}`,
      'Both containers run, and Terraform manages only the network.',
    );
    setFact('c12.p3.after_state_rm_plan_no_changes', /No changes\./.test(done.out));
    setFact('c12.p3.containers_running_at_end_count', running().filter((n) => n !== undefined && n.startsWith('tfc-c12-') && n !== 'tfc-c12-net').length);

    if (recording()) {
      writeFileSync(
        join(here, 'chart.svg'),
        barsSvg({
          title: 'Objects the plan would destroy after the cache block was deleted',
          unit: 'destroyed',
          bars: [
            { label: 'block deleted', value: bc?.destroy ?? 0 },
            { label: 'removed, no lifecycle', value: plc?.destroy ?? 0 },
            { label: 'removed, destroy = false', value: pc?.destroy ?? 0 },
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
