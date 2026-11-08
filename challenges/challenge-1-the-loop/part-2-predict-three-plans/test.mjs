// Challenge 1, part 2 test.
// Run: node --test challenges/challenge-1-the-loop/part-2-predict-three-plans/test.mjs
// Fill in predictions.json, then run run.mjs. The test fails until every prediction matches the real plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-1-the-loop/part-2-predict-three-plans/run.mjs';
const need = (name) => {
  const v = getFact(name);
  assert.notEqual(v, undefined, `No fact ${name}. ${hint}`);
  return v;
};
const labels = ['restart policy', 'greeting text', 'pet length'];

test('run.mjs has run: the facts exist', () => {
  need('c1.p2.baseline_added_count');
});

test('the baseline applied four resources', () => {
  assert.equal(need('c1.p2.baseline_added_count'), 4);
});

test('predictions.json has no blanks', () => {
  const w = workDir(import.meta.url);
  const file = join(w ?? here, 'predictions.json');
  const p = JSON.parse(readFileSync(file, 'utf8'));
  for (const k of ['edit1_container_restart', 'edit2_greeting_text', 'edit3_pet_length']) {
    for (const f of ['add', 'change', 'destroy']) {
      assert.equal(typeof p[k]?.[f], 'number', `predictions.json: ${k}.${f} is still blank. Write the number you expect on the Plan line in predictions.json, then run run.mjs again (the test reads the copy that run.mjs used).`);
    }
    assert.ok(Array.isArray(p[k].touches) && p[k].touches.length > 0, `predictions.json: ${k}.touches is empty. List the addresses you expect to see in the plan.`);
  }
});

for (const n of [1, 2, 3]) {
  test(`edit ${n} (${labels[n - 1]}): your prediction matches the real plan`, () => {
    const real = `${need(`c1.p2.edit${n}_add_count`)} add, ${need(`c1.p2.edit${n}_change_count`)} change, ${need(`c1.p2.edit${n}_destroy_count`)} destroy, ${need(`c1.p2.edit${n}_touched_count`)} resources`;
    assert.equal(
      need(`c1.p2.edit${n}_prediction_matches`),
      true,
      `The real plan for edit ${n} says ${real}. Look at the printout of run.mjs, find why, fix predictions.json and run again. Ask: does this attribute change in place, or does the provider have to destroy and create? What else uses this resource's value?`,
    );
  });
}

test('an update keeps the container, a replacement makes a new one', () => {
  assert.equal(need('c1.p2.update_apply_changed_count'), 1);
  assert.equal(need('c1.p2.update_keeps_container_id'), true);
  assert.equal(need('c1.p2.replace_apply_added_count'), 1);
  assert.equal(need('c1.p2.replace_apply_destroyed_count'), 1);
  assert.equal(need('c1.p2.replace_new_container_id'), true);
});

test('destroy removed everything and nothing labelled is left', () => {
  assert.equal(need('c1.p2.destroy_destroyed_count'), 4);
  assert.deepEqual(leftovers(1), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
