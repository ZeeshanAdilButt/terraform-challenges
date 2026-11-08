// Challenge 14, part 3 test.
// Run: node --test challenges/challenge-14-capstone/part-3-break-it-and-recover-it/test.mjs
// It reads the numbers of the last run (three failures, three recoveries) and your capstone/RUNBOOK.md in the work/ folder
// that run.mjs made. It fails until the platform recovers each time and the runbook holds the real error text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';
import { workOf } from '../lib.mjs';
import { failing, runbookChecks } from '../shape.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-14-capstone/part-3-break-it-and-recover-it/run.mjs';
const fact = (k) => getFact(`c14.p3.${k}`);
const work = workOf(import.meta.url);

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work/ folder yet. ${hint}`);
});

test('failure 1, a failed apply: it stops halfway, Terraform and Docker disagree, and the plan shows the way back', () => {
  assert.equal(fact('failed_apply_exit_code'), 1, `The apply must fail while another container holds the web port. Is the platform from part 1 finished? ${hint}`);
  assert.equal(
    fact('failed_apply_error'),
    'Unable to start container: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint <name> (<id>): Bind for 127.0.0.1:18401 failed: port is already allocated',
    hint,
  );
  assert.equal(fact('failed_apply_state_resources_count'), 6, 'The state keeps everything that was built, including the web container that never started.');
  assert.equal(fact('failed_apply_web_status'), 'created', 'Docker has the web container in status created: it never started.');
  assert.equal(fact('failed_apply_cache_status'), 'running', 'The cache was built before the failure and runs.');
  assert.equal(fact('failed_apply_web_tainted_in_plan'), true, 'The plan must say the web container is tainted, so must be replaced.');
});

test('recovery 1: free the port, apply again, and only the half-built container is replaced', () => {
  assert.equal(fact('recovery_plan_add_count'), 1, hint);
  assert.equal(fact('recovery_plan_destroy_count'), 1, hint);
  assert.equal(fact('recovery_apply_added_count'), 1, hint);
  assert.equal(fact('recovery_apply_destroyed_count'), 1, hint);
  assert.equal(fact('recovery_cache_kept'), true, 'The cache container (and its data) must not be touched by the recovery.');
  assert.equal(fact('recovery_web_status'), 200, hint);
});

test('failure 2, a stuck lock: the plan is refused, the error names the holder, force-unlock clears it', () => {
  assert.equal(fact('lock_held_before_unlock'), true, hint);
  assert.equal(fact('lock_plan_exit_code'), 1, hint);
  assert.equal(fact('lock_error_title'), 'Error acquiring the state lock', hint);
  assert.equal(fact('lock_error_names_holder'), true, 'The lock error must name who holds the lock (the Who: line).');
  assert.equal(fact('force_unlock_ok'), true, hint);
  assert.equal(fact('lock_held_after_unlock'), false, hint);
  assert.equal(fact('plan_after_unlock_no_changes'), true, 'After force-unlock a plan must say No changes.');
});

test('failure 3, lost state: the containers keep running, the plan wants to add everything, an apply is refused', () => {
  assert.equal(fact('backup_resources_count'), 6, 'terraform state pull must return the state with its 6 resources before the loss.');
  assert.equal(fact('lost_state_files_count'), 0, hint);
  assert.equal(fact('lost_plan_add_count'), 6, hint);
  assert.equal(fact('lost_containers_still_running_count'), 2, 'The real containers do not care that the state is gone.');
  assert.equal(fact('lost_apply_error'), 'Unable to create network: Error response from daemon: network with name tfc-c14-dev-net already exists', hint);
});

test('recovery 3: state push brings the state back, with the same containers and the data on the volume', () => {
  assert.equal(fact('push_ok'), true, hint);
  assert.equal(fact('restored_plan_no_changes'), true, 'After state push a plan must say No changes.');
  assert.equal(fact('restored_containers_kept'), true, 'The containers must be the same ones as before the loss.');
  assert.equal(fact('restored_cache_value'), 'hello', 'The value written to the cache before the loss must still be there.');
});

test('your runbook has a section for each failure with the real error text (Command, Error, Recovery)', () => {
  assert.ok(work, hint);
  const missing = failing(runbookChecks(work)).map((c) => `- ${c.message}`).join('\n');
  assert.equal(missing, '', 'Fix these in capstone/RUNBOOK.md:');
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
