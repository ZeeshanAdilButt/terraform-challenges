// Challenge 5, part 2 test.
// Run: node --test challenges/challenge-5-state/part-2-two-applies-one-lock/test.mjs
// It reads your backend.hcl and the facts the last run.mjs saved.
// It fails until the backend locks the state. That is on purpose.
// To test the reference solution instead: set TFC_REFERENCE=1 for both run.mjs and this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { leftovers } from '../../../toolkit/docker.js';
import { workDir } from '../../../toolkit/part.js';
import { partFile } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-5-state/part-2-two-applies-one-lock/run.mjs';
const hcl = () => partFile(import.meta.url, 'backend.hcl').replace(/^\s*#.*$/gm, '');

test('run.mjs has run (work/ exists)', () => {
  assert.ok(workDir(import.meta.url), `There is no work/ folder yet. ${hint}`);
});

test('backend.hcl sets lock_address and unlock_address', () => {
  assert.match(hcl(), /^\s*lock_address\s*=\s*".*\/lock\/@NAME@"/m, 'FIX: add lock_address = "http://@HOST@:@PORT@/lock/@NAME@" to backend.hcl.');
  assert.match(hcl(), /^\s*unlock_address\s*=\s*".*\/lock\/@NAME@"/m, 'FIX: add unlock_address = "http://@HOST@:@PORT@/lock/@NAME@" to backend.hcl.');
});

test('the last run: without lock addresses both applies ran (the proof that nothing protected the state)', () => {
  assert.equal(getFact('c5.p2.unlocked_apply_complete_count'), 2, hint);
  assert.equal(getFact('c5.p2.unlocked_lock_requests_count'), 0, hint);
});

test('the last run: with your backend.hcl the first apply took the lock and the second was refused', () => {
  assert.equal(getFact('c5.p2.first_apply_took_lock'), true, `The first apply never asked for a lock. Fix backend.hcl, then ${hint}`);
  assert.equal(getFact('c5.p2.second_apply_lock_error'), true, `The second apply was not refused. ${hint}`);
  assert.equal(getFact('c5.p2.second_apply_exit_code'), 1, hint);
  assert.match(String(getFact('c5.p2.lock_error_line')), /HTTP remote state already locked:/, hint);
  assert.equal(getFact('c5.p2.lock_info_who_known'), true, hint);
  assert.equal(getFact('c5.p2.first_apply_exit_code'), 0, `The first apply must finish normally. ${hint}`);
  assert.equal(getFact('c5.p2.lock_released_after_apply'), true, hint);
});

test('the last run: -lock-timeout waited, then gave up or got through', () => {
  assert.equal(getFact('c5.p2.lock_timeout_short_exit_code'), 1, hint);
  assert.ok(getFact('c5.p2.lock_timeout_short_waited_s') >= 5, 'The apply with -lock-timeout=5s should have waited at least 5 seconds.');
  assert.equal(getFact('c5.p2.lock_timeout_long_exit_code'), 0, hint);
  assert.equal(getFact('c5.p2.lock_timeout_long_no_changes'), true, hint);
});

test('the last run: a stale lock blocked plan, and force-unlock with the ID from the error fixed it', () => {
  assert.equal(getFact('c5.p2.stale_lock_blocks_plan'), true, hint);
  assert.equal(getFact('c5.p2.force_unlock_exit_code'), 0, hint);
  assert.equal(getFact('c5.p2.plan_after_force_unlock_exit_code'), 0, hint);
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(5), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
