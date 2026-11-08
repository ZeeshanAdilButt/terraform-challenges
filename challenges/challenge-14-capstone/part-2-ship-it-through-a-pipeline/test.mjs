// Challenge 14, part 2 test.
// Run: node --test challenges/challenge-14-capstone/part-2-ship-it-through-a-pipeline/test.mjs
// It runs your plan gate (the copy in work/, made by run.mjs) on small made-up plans, reads your workflow, and reads the
// numbers of the last run. It fails until the gate blocks the right plans and every action is pinned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';
import { workOf } from '../lib.mjs';
import { failing, gateChecks, workflowChecks } from '../shape.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-14-capstone/part-2-ship-it-through-a-pipeline/run.mjs';
const fact = (k) => getFact(`c14.p2.${k}`);
const work = workOf(import.meta.url);
const report = (checks) => failing(checks).map((c) => `- ${c.message}`).join('\n');

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work/ folder yet. ${hint}`);
});

test('the plan gate blocks the destroy or replacement of a protected resource and nothing else', () => {
  assert.ok(work, hint);
  assert.equal(report(gateChecks(work)), '', 'Fix these in capstone/gate/plan-gate.mjs:');
});

test('the workflow plans on pull request, applies the saved plan on merge, and pins every action', () => {
  assert.ok(work, hint);
  assert.equal(report(workflowChecks(work)), '', 'Fix these in .github/workflows/terraform.yml:');
});

test('every pin in the workflow is the commit its tag names on GitHub', () => {
  assert.ok(fact('uses_count') >= 5, `The workflow should use 5 different actions. ${hint}`);
  assert.equal(fact('uses_pinned_count'), fact('uses_count'), hint);
  assert.equal(fact('pins_wrong_count'), 0, 'A SHA in the workflow is not the commit that its tag comment names. Look it up again: gh api repos/<owner>/<repo>/commits/<tag> -q .sha');
  // -1 means gh was not installed or not signed in when run.mjs ran: the pins could not be checked against GitHub.
  assert.ok(fact('pins_verified_count') === -1 || fact('pins_verified_count') === fact('uses_count'), 'Some pins could not be verified. Install the GitHub CLI (gh), sign in, and run run.mjs again.');
});

test('the checks and the first plans pass through the pipeline, and the platform is applied from saved plans', () => {
  assert.equal(fact('check_dev_exit_code'), 0, hint);
  assert.equal(fact('check_prod_exit_code'), 0, hint);
  assert.equal(fact('baseline_dev_plan_add_count'), 6, hint);
  assert.equal(fact('baseline_prod_plan_add_count'), 6, hint);
  assert.equal(fact('baseline_gate_exit_code'), 0, 'Creating things must pass the gate.');
  assert.equal(fact('baseline_apply_ok'), true, hint);
});

test('a harmless change passes the gate and is applied', () => {
  assert.equal(fact('harmless_plan_change_count'), 1, 'Changing the memory limit is one in-place update.');
  assert.equal(fact('harmless_plan_destroy_count'), 0, hint);
  assert.equal(fact('harmless_gate_exit_code'), 0, 'An update of an unprotected resource must pass the gate.');
  assert.equal(fact('harmless_apply_ok'), true, hint);
  assert.equal(fact('harmless_second_plan_no_changes'), true, hint);
});

test('a change that would replace the protected cache container is blocked, and the cache is left alone', () => {
  assert.equal(fact('protected_plan_destroy_count'), 2, 'A new cache image replaces the image resource and the cache container: 2 to destroy.');
  assert.equal(fact('protected_gate_exit_code'), 1, 'The gate must fail the job when the cache container would be replaced.');
  assert.match(fact('protected_gate_line'), /^BLOCKED: module\.service\.docker_container\.cache would be delete then create, and it is labelled protected\.$/);
  assert.equal(fact('protected_cache_container_kept'), true, 'The blocked plan must not have changed the cache container.');
});

test('renaming the prod data volume is stopped by prevent_destroy, and a stale saved plan is refused', () => {
  assert.equal(fact('volume_plan_exit_code'), 1, hint);
  assert.equal(fact('volume_plan_error'), 'Instance cannot be destroyed', hint);
  assert.equal(fact('stale_apply_exit_code'), 1, hint);
  assert.equal(fact('stale_apply_error'), 'Saved plan is stale', hint);
});

test('plan on one fresh state server and apply on another works, like two jobs on two runners', () => {
  assert.equal(fact('two_jobs_plan_exit_code'), 0, hint);
  assert.equal(fact('two_jobs_apply_exit_code'), 0, hint);
  assert.equal(fact('two_jobs_apply_added_count'), 6, hint);
});

test('nothing is left in Docker', () => {
  assert.equal(fact('leftover_count'), 0, 'Run: node toolkit/cleanup.mjs 14');
  assert.deepEqual(leftovers(14), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
