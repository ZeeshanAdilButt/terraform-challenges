// Challenge 3, part 2 test.
// Run: node --test challenges/challenge-3-the-index-shift/part-2-for-each-keys/test.mjs
// Fix main.tf and unknown-keys/main.tf, run run.mjs, then run this. It fails until both are fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-3-the-index-shift/part-2-for-each-keys/run.mjs';
const need = (name) => {
  const v = getFact(name);
  const stuck = getFact('c3.p2.baseline_plan_ok') === false ? ' The last run stopped because main.tf does not plan: use for_each = toset(var.names), then run run.mjs again.' : '';
  assert.notEqual(v, undefined, `No fact ${name}.${stuck || ` ${hint}`}`);
  return v;
};

test('run.mjs has run: the facts exist', () => {
  need('c3.p2.baseline_plan_ok');
});

test('main.tf plans: for_each gets a set, not a list', () => {
  assert.equal(
    need('c3.p2.baseline_plan_ok'),
    true,
    'for_each = var.names fails because a list has positions, not keys. Use for_each = toset(var.names). The error text is in the run.mjs printout.',
  );
  assert.equal(need('c3.p2.baseline_added_count'), 8, 'Five names and three sites make eight resources.');
});

test('removing the middle name destroys exactly one resource and adds none', () => {
  assert.deepEqual([need('c3.p2.remove_middle_add_count'), need('c3.p2.remove_middle_change_count'), need('c3.p2.remove_middle_destroy_count')], [0, 0, 1]);
  assert.equal(need('c3.p2.middle_apply_destroyed_count'), 1);
  assert.equal(need('c3.p2.middle_apply_added_count'), 0);
  assert.equal(need('c3.p2.files_after_middle_apply_count'), 4);
});

test('removing the first or last name destroys one, reversing changes nothing, inserting adds one', () => {
  assert.equal(need('c3.p2.remove_first_destroy_count'), 1);
  assert.equal(need('c3.p2.remove_last_destroy_count'), 1);
  assert.equal(need('c3.p2.reverse_no_changes'), true);
  assert.deepEqual([need('c3.p2.insert_front_add_count'), need('c3.p2.insert_front_destroy_count')], [1, 0]);
});

test('editing one value in a map touches one resource; removing or adding a key touches one', () => {
  assert.deepEqual([need('c3.p2.site_edit_add_count'), need('c3.p2.site_edit_destroy_count')], [1, 1]);
  assert.deepEqual([need('c3.p2.site_remove_add_count'), need('c3.p2.site_remove_destroy_count')], [0, 1]);
  assert.deepEqual([need('c3.p2.site_add_add_count'), need('c3.p2.site_add_destroy_count')], [1, 0]);
});

test('keys that are only known after apply are refused (the demo)', () => {
  assert.equal(need('c3.p2.unknown_keys_error_shown'), true);
});

test('unknown-keys/main.tf plans: keys are written by you, only values are unknown', () => {
  assert.equal(
    need('c3.p2.unknown_keys_fixed_plan_ok'),
    true,
    'unknown-keys/main.tf still builds its for_each keys from random_pet names. Write the keys yourself (first, second) and keep the pet names as values: for_each = { first = random_pet.app[0].id, second = random_pet.app[1].id }, and use each.value.',
  );
  assert.equal(need('c3.p2.unknown_keys_fixed_add_count'), 4);
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
