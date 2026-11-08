// Challenge 14, part 4 test: the checklist.
// Run: node --test challenges/challenge-14-capstone/part-4-the-defence/test.mjs
// It reads the capstone files in the work/ folder that run.mjs made (a copy of your capstone/, or the reference with
// --reference): RUNBOOK.md and DEFENCE.md, and then the whole rubric. It checks shape, not prose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workOf } from '../lib.mjs';
import { allChecks, defenceChecks, failing, runbookChecks } from '../shape.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-14-capstone/part-4-the-defence/run.mjs';
const work = workOf(import.meta.url);
const report = (checks) => failing(checks).map((c) => `- ${c.message}`).join('\n');

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work/ folder yet. ${hint}`);
});

test('the runbook has the lock, lost-state and failed-apply sections, each with the real error text', () => {
  assert.ok(work, hint);
  assert.equal(report(runbookChecks(work)), '', 'Fix these in capstone/RUNBOOK.md:');
});

test('the defence has a link and an answer to each question', () => {
  assert.ok(work, hint);
  assert.equal(report(defenceChecks(work)), '', 'Fix these in capstone/DEFENCE.md:');
});

test('the whole rubric checklist is complete', () => {
  assert.ok(work, hint);
  assert.equal(report(allChecks(work)), '', 'These pieces of the capstone are missing:');
  assert.equal(getFact('c14.p4.checklist_passed_count'), getFact('c14.p4.checklist_total_count'), hint);
});

test('the Docker-free test that CI runs passes on this capstone', () => {
  assert.equal(getFact('c14.p4.ci_tests_fail_count'), 0, `CI would be red. ${hint}`);
  assert.ok(getFact('c14.p4.ci_tests_pass_count') >= 60, `CI should run at least 60 checks. ${hint}`);
});

test('the earlier parts passed their last runs: the platform builds, the pipeline blocks, the three failures recover', () => {
  assert.equal(getFact('c14.p1.tests_failed_count'), 0, 'Part 1: terraform test fails. Run its run.mjs.');
  assert.equal(getFact('c14.p1.web_reaches_cache'), '+PONG', 'Part 1: the web container does not reach the cache.');
  assert.equal(getFact('c14.p2.protected_gate_exit_code'), 1, 'Part 2: the gate did not block the replacement of the protected cache.');
  assert.equal(getFact('c14.p2.stale_apply_error'), 'Saved plan is stale', 'Part 2: run its run.mjs.');
  assert.equal(getFact('c14.p3.recovery_web_status'), 200, 'Part 3: the failed apply was not recovered.');
  assert.equal(getFact('c14.p3.plan_after_unlock_no_changes'), true, 'Part 3: the stuck lock was not recovered.');
  assert.equal(getFact('c14.p3.restored_plan_no_changes'), true, 'Part 3: the lost state was not restored.');
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
