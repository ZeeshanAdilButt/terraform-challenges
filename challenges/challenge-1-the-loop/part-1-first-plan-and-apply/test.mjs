// Challenge 1, part 1 test.
// Run: node --test challenges/challenge-1-the-loop/part-1-first-plan-and-apply/test.mjs
// Run run.mjs first. The test fails until main.tf is fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-1-the-loop/part-1-first-plan-and-apply/run.mjs';
const need = (name) => {
  const v = getFact(name);
  assert.notEqual(v, undefined, `No fact ${name}. ${hint}`);
  return v;
};

test('run.mjs has run: the facts exist', () => {
  need('c1.p1.plan1_add_count');
});

test('the first plan adds four resources and apply made four', () => {
  assert.deepEqual([need('c1.p1.plan1_add_count'), need('c1.p1.plan1_change_count'), need('c1.p1.plan1_destroy_count')], [4, 0, 0]);
  assert.equal(need('c1.p1.apply_added_count'), 4);
});

test('the container is named tfc-c1-<what>', () => {
  assert.equal(need('c1.p1.container_named_tfc'), true, 'Name the container tfc-c1-sleeper. Every Docker object in a challenge is named tfc-c<N>-<what>.');
});

test('the container carries the label tfc.challenge=1', () => {
  assert.equal(need('c1.p1.container_labelled'), true, 'Add a labels block to docker_container.sleeper: label = "tfc.challenge", value = "1". Without it, cleanup cannot find the container.');
  assert.equal(need('c1.p1.container_running'), true, 'The container is not running.');
});

test('the second plan says "No changes"', () => {
  const clean = need('c1.p1.plan2_no_changes');
  assert.equal(
    clean,
    true,
    `The second plan still wants ${getFact('c1.p1.plan2_add_count')} to add, ${getFact('c1.p1.plan2_change_count')} to change, ${getFact('c1.p1.plan2_destroy_count')} to destroy, and you edited nothing. ` +
      'Read work/plan-2.txt and find what differs: a value that changes on every plan (a function such as timestamp()), or an attribute the provider fills in with something other than what you wrote (memory_swap).',
  );
});

test('state lists the four resources and destroy removed four', () => {
  assert.equal(need('c1.p1.state_resource_count'), 4);
  assert.equal(need('c1.p1.destroy_destroyed_count'), 4);
});

test('destroy left no labelled container and kept the alpine image', () => {
  assert.equal(need('c1.p1.leftover_after_destroy_count'), 0);
  assert.equal(need('c1.p1.alpine_image_kept'), true, 'docker_image.alpine needs keep_locally = true.');
  assert.deepEqual(leftovers(1), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
