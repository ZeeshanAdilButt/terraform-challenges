// Challenge 7, part 2 test.
// Run: node --test challenges/challenge-7-a-module/part-2-version-with-git/test.mjs
// It reads the numbers run.mjs saved from your last run. It fails until main.tf pins a release that works.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-7-a-module/part-2-version-with-git/run.mjs';
const fact = (k) => getFact(`c7.p2.${k}`);

test('run.mjs has been run', () => {
  assert.notEqual(fact('init_ok'), undefined, `No facts yet. ${hint}`);
});

test('the repository has three release tags', () => {
  assert.equal(fact('tags_count'), 3, hint);
});

test('init works: the ref in main.tf points at a release whose interface matches the caller', () => {
  assert.equal(fact('init_ok'), true, `terraform init failed. main.tf asks for ?ref=main, which is the newest release and renamed an input. Pin a release tag that still matches the arguments main.tf passes (or pin 2.0.0 and rename the argument). ${hint}`);
});

test('the module is pinned to a release tag, not to a branch', () => {
  assert.equal(fact('pinned_to_tag'), true, `?ref= must name a release tag (v1.0.0, v1.1.0 or v2.0.0). A branch moves. ${hint}`);
  assert.match(fact('module_source_recorded'), /\?ref=v\d+\.\d+\.\d+$/, 'The source init recorded should end in ?ref=vX.Y.Z');
});

test('plan and apply work with the pinned release', () => {
  assert.equal(fact('plan_ok'), true, hint);
  assert.equal(fact('apply_ok'), true, hint);
  assert.equal(fact('destroyed_count'), 5, hint);
});

test('the demo showed what changing the ref does', () => {
  assert.equal(fact('upgrade_minor_changes_count'), 0, `A backwards compatible upgrade (1.0.0 to 1.1.0) should change nothing. ${hint}`);
  assert.equal(fact('upgrade_major_plan_fails'), true, hint);
  assert.equal(fact('upgrade_major_fixed_changes_count'), 0, hint);
  assert.match(fact('version_on_git_source_error'), /Invalid registry module source address/, hint);
  assert.equal(fact('moved_tag_upgrade_plan_fails'), true, hint);
  assert.equal(fact('commit_pin_changes_count'), 0, hint);
});

test('nothing is left in Docker', () => {
  assert.equal(fact('leftover_count'), 0, 'Run: node toolkit/cleanup.mjs 7');
  assert.deepEqual(leftovers(7), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});
