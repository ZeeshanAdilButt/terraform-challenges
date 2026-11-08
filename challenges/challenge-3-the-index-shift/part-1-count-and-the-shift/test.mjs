// Challenge 3, part 1 test.
// Run: node --test challenges/challenge-3-the-index-shift/part-1-count-and-the-shift/test.mjs
// Fix main.tf and fill in predictions.json, run run.mjs, then run this. It fails until both are right.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-3-the-index-shift/part-1-count-and-the-shift/run.mjs';
const need = (name) => {
  const v = getFact(name);
  assert.notEqual(v, undefined, `No fact ${name}. ${hint}`);
  return v;
};

test('run.mjs has run: the facts exist', () => {
  need('c3.p1.baseline_added_count');
});

test('five names make five files', () => {
  assert.equal(need('c3.p1.baseline_added_count'), 5);
});

test('count follows the length of the list', () => {
  for (const k of ['remove_first', 'remove_middle', 'remove_last']) {
    assert.equal(
      need(`c3.p1.${k}_plan_ok`),
      true,
      'The plan failed for a list of four names. In main.tf, replace the fixed count = 5 with count = length(var.names), so the number of files follows the list. The error text is in the run.mjs printout.',
    );
  }
});

const SCENARIOS = [
  ['remove_first', 'remove the first name'],
  ['remove_middle', 'remove the middle name'],
  ['remove_last', 'remove the last name'],
];
for (const [key, label] of SCENARIOS) {
  test(`your prediction for "${label}" matches the real plan`, () => {
    assert.equal(need(`c3.p1.${key}_plan_ok`), true, 'The plan failed, so there is nothing to compare yet: make count follow the list (count = length(var.names)) and run run.mjs again.');
    const real = `${need(`c3.p1.${key}_add_count`)} add, ${need(`c3.p1.${key}_change_count`)} change, ${need(`c3.p1.${key}_destroy_count`)} destroy`;
    assert.equal(
      need(`c3.p1.${key}_prediction_matches`),
      true,
      `The real plan says ${real}. Edit predictions.json, then run run.mjs again (the test reads the facts of the last run). Think about which positions get a different name.`,
    );
  });
}

test('the shift is real: the middle removal, applied, destroyed three and created two', () => {
  assert.equal(need('c3.p1.remove_middle_plan_ok'), true, 'The middle removal could not be applied because the plan fails: make count follow the list (count = length(var.names)).');
  assert.equal(need('c3.p1.middle_apply_destroyed_count'), 3);
  assert.equal(need('c3.p1.middle_apply_added_count'), 2);
  assert.equal(need('c3.p1.files_after_middle_apply_count'), 4);
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
