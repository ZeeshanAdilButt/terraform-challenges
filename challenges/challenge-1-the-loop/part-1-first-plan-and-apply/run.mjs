// Challenge 1, part 1: the first plan and apply, and a second plan that should say "No changes".
// Run: node challenges/challenge-1-the-loop/part-1-first-plan-and-apply/run.mjs
// Add --record to also write results.md next to this file.
//
// It plans and applies a random name, a file and a container (alpine:3.23, kept locally), plans again, lists
// the state, then destroys everything. The reference run uses the fixed files in reference/.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDocker, cleanup, leftovers, run as docker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { Recorder } from '../../../toolkit/record.js';
import { applyCounts, mode, planCounts } from '../../../toolkit/tf.js';
import { N, imageExists, planSummary, section, tfx } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 1, part 1: first plan and apply');
const opts = (work) => ({ cwd: work, docker: true });

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });
let applied = false;
try {
  cleanup(N);

  // Step 1: init.
  const init = tfx(['init'], opts(work));
  rec.step('terraform init', section(init.out, /Initializing provider plugins/, 9), 'init installs the three providers (docker, random, local) and checks each against the lock file that comes with this part.');
  if (init.code !== 0) throw new Error(`terraform init failed:\n${init.out}`);

  // Step 2: the first plan.
  const plan1 = tfx(['plan'], opts(work));
  const pc1 = planCounts(plan1.out);
  rec.step(
    'terraform plan   (lines that name a resource, and the Plan line)',
    planSummary(plan1.out),
    'Nothing exists yet, so every resource is "will be created". The plan changes nothing; it only predicts.',
  );
  if (!pc1) throw new Error(`The first plan failed:\n${plan1.out}`);

  // Step 3: apply.
  const apply = tfx(['apply', '-auto-approve'], opts(work));
  const ac = applyCounts(apply.out);
  applied = true;
  rec.step(
    'terraform apply -auto-approve   (without the plan text)',
    section(apply.out, /Creating\.\.\./, 14),
    'apply repeats the plan, then does it. Terraform orders the work itself: the image and the pet first, the container last, because the container needs the image.',
  );
  if (!ac) throw new Error(`apply failed:\n${apply.out}`);

  // Step 4: what exists now. The container is found through state, so a wrong name or a missing label still shows up.
  const shownState = JSON.parse(tfx(['show', '-json'], opts(work)).stdout);
  const box = shownState.values.root_module.resources.find((r) => r.type === 'docker_container').values;
  const inspect = docker(['inspect', box.id, '--format', '{{.Name}} label={{index .Config.Labels "tfc.challenge"}} running={{.State.Running}}']);
  const ps = docker(['ps', '--filter', `label=tfc.challenge=${N}`, '--format', '{{.Names}}\t{{.Image}}\t{{.Command}}\t{{.Status}}']);
  const named = /^\/tfc-c1-/.test(inspect.stdout);
  rec.step(
    `docker ps --filter label=tfc.challenge=${N}`,
    ps.stdout.trim() || "(no container carries the label tfc.challenge=1)",
    ps.stdout.trim() ? "The container exists, is running, and carries the label cleanup uses." : "No container has the label, so `node toolkit/cleanup.mjs 1` could not find it. The name is " + inspect.stdout.split(" ")[0].trim() + ".",
  );

  // Step 5: the file.
  const cat = readFileSync(join(work, 'greeting.txt'), 'utf8');
  rec.step('cat greeting.txt', cat.trim(), 'The file Terraform made. The random pet name is different on every machine.');

  // Step 6: the second plan, with nothing changed.
  const plan2 = tfx(['plan'], opts(work));
  writeFileSync(join(work, 'plan-2.txt'), plan2.out);
  const pc2 = planCounts(plan2.out);
  const clean = /No changes\. Your infrastructure matches the configuration\./.test(plan2.out);
  const diffs = plan2.out
    .split('\n')
    .filter((l) => /^\s+[~-] .*(->|=)/.test(l) && !/content_(base64|md5|sha)/.test(l))
    .slice(0, 8);
  rec.step(
    'terraform plan   (the second plan, nothing edited)',
    clean ? plan2.out.split('\n').filter((l) => /^No changes/.test(l)).join('\n') : [planSummary(plan2.out), ...diffs].join('\n'),
    clean
      ? 'No changes. The real world matches the configuration, and Terraform proves it by reading every resource again.'
      : 'Not clean. Terraform wants to change things you did not edit. The full plan is in work/plan-2.txt. Find what differs, fix it, run again.',
  );

  // Step 7: the state.
  const list = tfx(['state', 'list'], opts(work));
  rec.step('terraform state list', list.code === 0 ? list.stdout.trim() : list.out.trim(), 'State is the list of what Terraform made. Each name is an address: type.name.');

  // Step 8: destroy.
  const destroy = tfx(['destroy', '-auto-approve'], opts(work));
  applied = false;
  const dm = /Destroy complete! Resources: (\d+) destroyed/.exec(destroy.out);
  const left = leftovers(N);
  const alpineKept = imageExists('alpine:3.23');
  rec.step(
    'terraform destroy -auto-approve   (without the plan text)',
    section(destroy.out, /Destroying\.\.\./, 12),
    `destroy removed ${dm ? dm[1] : '?'} resources. alpine:3.23 ${alpineKept ? 'is still on this machine, because keep_locally = true' : 'is GONE from this machine'}.`,
  );

  // Facts.
  setFact('c1.p1.plan1_add_count', pc1.add);
  setFact('c1.p1.plan1_change_count', pc1.change);
  setFact('c1.p1.plan1_destroy_count', pc1.destroy);
  setFact('c1.p1.apply_added_count', ac.added);
  setFact('c1.p1.container_labelled', inspect.code === 0 && /label=1 /.test(inspect.stdout));
  setFact('c1.p1.container_named_tfc', named);
  setFact('c1.p1.container_running', inspect.code === 0 && /running=true/.test(inspect.stdout));
  setFact('c1.p1.plan2_no_changes', clean);
  setFact('c1.p1.plan2_add_count', pc2?.add ?? 0);
  setFact('c1.p1.plan2_change_count', pc2?.change ?? 0);
  setFact('c1.p1.plan2_destroy_count', pc2?.destroy ?? 0);
  setFact('c1.p1.state_resource_count', list.stdout.split('\n').filter((l) => l.trim()).length);
  setFact('c1.p1.destroy_destroyed_count', dm ? Number(dm[1]) : -1);
  setFact('c1.p1.leftover_after_destroy_count', left.containers + left.networks + left.volumes);
  setFact('c1.p1.alpine_image_kept', alpineKept);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, runner mode ${mode()}, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c1.p1');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (applied) tfx(['destroy', '-auto-approve'], opts(work));
  cleanup(N);
}
