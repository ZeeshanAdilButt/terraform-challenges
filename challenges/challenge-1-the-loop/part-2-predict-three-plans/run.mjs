// Challenge 1, part 2: predict three plans.
// Run: node challenges/challenge-1-the-loop/part-2-predict-three-plans/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
//
// It applies the baseline in main.tf, then makes three edits one at a time, plans each (never applies them),
// and compares the real plan with your predictions.json. Then it applies two edits for real, one in-place
// update and one replacement, and checks whether the container is the same object afterwards.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDocker, cleanup, run as docker } from '../../../toolkit/docker.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { setFact } from '../../../toolkit/facts.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { Recorder } from '../../../toolkit/record.js';
import { applyCounts, mode, planCounts } from '../../../toolkit/tf.js';
import { N, planSummary, section, tfx, touched } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 1, part 2: predict three plans');
const opts = (work) => ({ cwd: work, docker: true });

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// The three edits you predict, and the fourth that only gets applied. Each is one exact text swap in main.tf.
const EDITS = [
  { key: 'edit1_container_restart', from: 'restart     = "no"', to: 'restart     = "on-failure"', what: 'container restart policy "no" -> "on-failure"' },
  { key: 'edit2_greeting_text', from: 'content  = "hello from', to: 'content  = "hi from', what: 'greeting text "hello from" -> "hi from"' },
  { key: 'edit3_pet_length', from: 'length = 2', to: 'length = 3', what: 'random_pet length 2 -> 3' },
];
const FOURTH = { from: 'command     = ["sleep", "3600"]', to: 'command     = ["sleep", "7200"]', what: 'container command sleep 3600 -> sleep 7200' };

const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });
const mainPath = join(work, 'main.tf');
const baseline = readFileSync(mainPath, 'utf8');
const containerId = () => {
  const r = docker(['inspect', 'tfc-c1-p2-sleeper', '--format', '{{.Id}}']);
  return r.code === 0 ? r.stdout.trim().slice(0, 12) : '';
};
const swap = (text, e) => {
  if (!text.includes(e.from)) throw new Error(`main.tf no longer contains "${e.from}". Leave main.tf as it is: you edit predictions.json, not the baseline.`);
  return text.replace(e.from, e.to);
};
let applied = false;

try {
  cleanup(N);
  const predictions = JSON.parse(readFileSync(join(work, 'predictions.json'), 'utf8'));

  const init = tfx(['init'], opts(work));
  if (init.code !== 0) throw new Error(`terraform init failed:\n${init.out}`);

  // Step 1: the baseline.
  const apply0 = tfx(['apply', '-auto-approve'], opts(work));
  const a0 = applyCounts(apply0.out);
  if (!a0) throw new Error(`The baseline apply failed:\n${apply0.out}`);
  applied = true;
  const id0 = containerId();
  rec.step('terraform apply -auto-approve   (the baseline in main.tf)', section(apply0.out, /Apply complete/, 3), 'Four resources exist: a pet name, a greeting file, an image and a container. Now we change one thing at a time and only plan.');

  // Steps 2 to 4: three edits, plan only.
  const real = [];
  for (const [i, e] of EDITS.entries()) {
    writeFileSync(mainPath, swap(baseline, e));
    const p = tfx(['plan'], opts(work));
    writeFileSync(mainPath, baseline);
    const c = planCounts(p.out) ?? { add: 0, change: 0, destroy: 0 };
    const t = touched(p.out);
    const want = predictions[e.key] ?? {};
    const sameCounts = want.add === c.add && want.change === c.change && want.destroy === c.destroy;
    const sameTouches = Array.isArray(want.touches) && [...want.touches].sort().join() === [...t].sort().join();
    const match = sameCounts && sameTouches;
    real.push({ ...e, ...c, touches: t, match });
    const predicted = want.add == null ? 'no prediction yet' : `${want.add} add, ${want.change} change, ${want.destroy} destroy, touches ${JSON.stringify(want.touches ?? [])}`;
    rec.step(
      `edit ${i + 1}: ${e.what}; then terraform plan   (resource lines and the Plan line)`,
      `${planSummary(p.out)}\nYour prediction: ${predicted}\nResult: ${match ? 'matches' : 'does not match'}`,
      i === 0
        ? 'One line says "will be updated in-place": Terraform changes the same container. No add and no destroy.'
        : i === 1
          ? 'A file content cannot be changed in place by this provider, so the plan says "must be replaced" with "forces replacement": one destroy and one add.'
          : 'Look at which addresses appear. The pet is replaced, and the file text is built from the pet name, so the file must be replaced too. You never edited the file.',
    );
  }

  // Step 5: apply the in-place update for real.
  writeFileSync(mainPath, swap(baseline, EDITS[0]));
  const up = tfx(['apply', '-auto-approve'], opts(work));
  const upc = applyCounts(up.out);
  const id1 = containerId();
  rec.step(
    'apply edit 1 for real; docker inspect the container id before and after',
    `${section(up.out, /will be updated in-place/, 1)}\n${section(up.out, /Apply complete/, 1)}\ncontainer id before ${id0}\ncontainer id after  ${id1}`,
    'An update changes the same object. The container id is the same: it is the same container, changed in place.',
  );

  // Step 6: apply a replacement for real (a fourth edit), on top of edit 1.
  writeFileSync(mainPath, swap(swap(baseline, EDITS[0]), FOURTH));
  const rep = tfx(['apply', '-auto-approve'], opts(work));
  const repc = applyCounts(rep.out);
  const repPlan = planCounts(rep.out) ?? { add: 0, change: 0, destroy: 0 };
  const id2 = containerId();
  rec.step(
    `apply a fourth edit for real (${FOURTH.what}); docker inspect the container id`,
    `${section(rep.out, /must be replaced/, 1)}\n${section(rep.out, /Apply complete/, 1)}\ncontainer id before ${id1}\ncontainer id after  ${id2}`,
    'A replacement destroys the old object and creates a new one. The container id changed: it is a new container, and anything inside the old one is gone.',
  );

  // Facts.
  setFact('c1.p2.baseline_added_count', a0.added);
  real.forEach((r, i) => {
    const n = i + 1;
    setFact(`c1.p2.edit${n}_add_count`, r.add);
    setFact(`c1.p2.edit${n}_change_count`, r.change);
    setFact(`c1.p2.edit${n}_destroy_count`, r.destroy);
    setFact(`c1.p2.edit${n}_touched_count`, r.touches.length);
    setFact(`c1.p2.edit${n}_prediction_matches`, r.match);
  });
  setFact('c1.p2.predictions_correct_count', real.filter((r) => r.match).length);
  setFact('c1.p2.update_apply_changed_count', upc?.changed ?? -1);
  setFact('c1.p2.update_keeps_container_id', id0 !== '' && id0 === id1);
  setFact('c1.p2.replace_apply_added_count', repc?.added ?? -1);
  setFact('c1.p2.replace_apply_destroyed_count', repc?.destroyed ?? -1);
  setFact('c1.p2.replace_new_container_id', id1 !== '' && id2 !== '' && id1 !== id2);
  setFact('c1.p2.edit4_destroy_count', repPlan.destroy);

  // Cleanup: terraform destroy, then the label-based sweep.
  const destroy = tfx(['destroy', '-auto-approve'], opts(work));
  applied = false;
  const dm = /Destroy complete! Resources: (\d+) destroyed/.exec(destroy.out);
  setFact('c1.p2.destroy_destroyed_count', dm ? Number(dm[1]) : -1);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, runner mode ${mode()}, Node ${process.versions.node}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Resources destroyed by each plan',
        unit: 'destroyed',
        bars: [
          { label: 'edit 1: restart policy', value: real[0].destroy },
          { label: 'edit 2: greeting text', value: real[1].destroy },
          { label: 'edit 3: pet length', value: real[2].destroy },
          { label: 'edit 4: container command', value: repPlan.destroy },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  const ok = real.filter((r) => r.match).length;
  console.log(`\nYou predicted ${ok} of ${real.length} plans. See your numbers with: node toolkit/show-facts.mjs c1.p2`);
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  try {
    writeFileSync(mainPath, baseline);
    if (applied) tfx(['destroy', '-auto-approve'], opts(work));
  } catch {
    /* the sweep below still removes anything labelled */
  }
  cleanup(N);
}
