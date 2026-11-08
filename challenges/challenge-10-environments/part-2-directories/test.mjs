// Challenge 10, part 2 test.
// Run: node --test challenges/challenge-10-environments/part-2-directories/test.mjs
// It reads the work folder and the facts that run.mjs saved. It fails until prod is protected from a destroy.
// That is on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';
import { leftovers } from '../../../toolkit/docker.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-10-environments/part-2-directories/run.mjs';
const work = workDir(import.meta.url);
const env = (e) => {
  const p = work && join(work, 'envs', e, 'main.tf');
  return p && existsSync(p) ? readFileSync(p, 'utf8') : '';
};

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work folder yet. ${hint}`);
  assert.notEqual(getFact('c10.p2.state_files_count'), undefined, `No facts yet. ${hint}`);
});

test('prod has prevent_destroy in a lifecycle block', () => {
  const m = /resource "docker_container" "app" \{[\s\S]*?lifecycle \{([\s\S]*?)\}/.exec(env('prod'));
  assert.ok(m, 'Add a lifecycle block to the docker_container in envs/prod/main.tf.');
  assert.match(m[1], /prevent_destroy\s*=\s*true/, 'Inside the lifecycle block, set prevent_destroy = true.');
});

test('dev stays easy to throw away', () => {
  assert.doesNotMatch(env('dev'), /prevent_destroy/, 'Leave dev unguarded: it is meant to be destroyed and rebuilt.');
});

test('each environment has its own state on the server and none on disk', () => {
  assert.equal(getFact('c10.p2.state_files_count'), 2);
  assert.equal(getFact('c10.p2.local_tfstate_files_count'), 0);
});

test('a dev change does not touch the prod state', () => {
  assert.ok(getFact('c10.p2.dev_serial_after_change') > getFact('c10.p2.dev_serial_before_change'), 'The dev state should move forward after the dev apply.');
  assert.equal(getFact('c10.p2.prod_serial_unchanged'), true);
  assert.equal(getFact('c10.p2.prod_plan_no_changes'), true);
});

test('the state is locked on every run', () => {
  assert.ok(getFact('c10.p2.lock_requests_count') > 0, 'The server saw no LOCK requests. Does backend.hcl still have lock_address and unlock_address?');
  assert.equal(getFact('c10.p2.unlock_requests_count'), getFact('c10.p2.lock_requests_count'), 'Every lock should be released.');
});

test('dev can be destroyed and prod cannot', () => {
  assert.equal(getFact('c10.p2.destroy_dev_ok'), true);
  assert.equal(getFact('c10.p2.destroy_prod_blocked'), true, 'terraform destroy in envs/prod must fail with "Instance cannot be destroyed". Add prevent_destroy to prod.');
  assert.equal(getFact('c10.p2.prod_containers_after_blocked_destroy_count'), 1, 'The prod container must still exist after the blocked destroy.');
});

test('the guard is only as strong as the code', () => {
  assert.equal(getFact('c10.p2.no_guard_destroy_count'), 2, 'Without the lifecycle block the destroy plan covers the container and the image.');
  assert.equal(getFact('c10.p2.resource_removed_destroy_count'), 1, 'Deleting the container block plans one destroy, with no complaint.');
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(10), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
