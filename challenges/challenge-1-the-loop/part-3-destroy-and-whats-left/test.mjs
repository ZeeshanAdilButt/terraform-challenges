// Challenge 1, part 3 test.
// Run: node --test challenges/challenge-1-the-loop/part-3-destroy-and-whats-left/test.mjs
// Run run.mjs first. The test fails until the image that must survive a destroy is marked keep_locally = true.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run as docker, leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-1-the-loop/part-3-destroy-and-whats-left/run.mjs';
const need = (name) => {
  const v = getFact(name);
  assert.notEqual(v, undefined, `No fact ${name}. ${hint}`);
  return v;
};

test('run.mjs has run: the facts exist', () => {
  need('c1.p3.destroy_destroyed_count');
});

test('Terraform managed three image names and destroyed three', () => {
  assert.equal(need('c1.p3.apply_added_count'), 3);
  assert.equal(need('c1.p3.destroy_destroyed_count'), 3);
});

test('alpine:3.23 itself was never touched', () => {
  assert.equal(need('c1.p3.alpine_present_after'), true, 'alpine:3.23 is gone from this machine. Pull it again with: docker pull alpine:3.23. This part must never remove it.');
  assert.equal(need('c1.p3.alpine_id_unchanged'), true);
});

test('with keep_locally = false, destroy removes the name (throwaway) and, for a last name, the image (solo)', () => {
  assert.equal(need('c1.p3.throwaway_present_after'), false, 'tfc-c1-throwaway:1 is still there. Its keep_locally must stay false in this part: that is what the part shows.');
  assert.equal(need('c1.p3.solo_present_after'), false, 'tfc-c1-solo:1 is still there. Its keep_locally must stay false in this part.');
  assert.equal(need('c1.p3.solo_image_deleted'), true);
});

test('the image that must survive a destroy has keep_locally = true', () => {
  assert.equal(
    need('c1.p3.kept_present_after'),
    true,
    'docker_image.kept lost its name on destroy. Add keep_locally = true to it. Without it, destroy removes the image from your machine, even if another project uses it. In real projects every docker_image gets keep_locally = true.',
  );
});

test('nothing labelled is left, and the three throwaway names are removed after the run', () => {
  assert.deepEqual(leftovers(1), { containers: 0, networks: 0, volumes: 0 });
  for (const ref of ['tfc-c1-throwaway:1', 'tfc-c1-kept:1', 'tfc-c1-solo:1']) {
    assert.notEqual(docker(['image', 'inspect', ref]).code, 0, `${ref} is still on the machine. run.mjs removes it at the end; if a run crashed, remove it by its exact name: docker image rm ${ref}`);
  }
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
