// Challenge 14, part 1 test.
// Run: node --test challenges/challenge-14-capstone/part-1-define-the-platform/test.mjs
// It reads the work/ folder that run.mjs made (a copy of your capstone/, or the reference with --reference)
// and the numbers of the last run. It fails until the platform is defined and works.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';
import { workOf } from '../lib.mjs';
import { envChecks, failing, moduleChecks, testChecks } from '../shape.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-14-capstone/part-1-define-the-platform/run.mjs';
const fact = (k) => getFact(`c14.p1.${k}`);
const work = workOf(import.meta.url);
const report = (checks) => failing(checks).map((c) => `- ${c.message}`).join('\n');

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work/ folder yet. ${hint}`);
});

test('the module has the interface of a module: variables with rules, five outputs, a pinned provider', () => {
  assert.ok(work, hint);
  assert.equal(report(moduleChecks(work)), '', 'Fix these in capstone/modules/service:');
});

test('dev and prod are separate folders with separate state, and prod guards its data', () => {
  assert.ok(work, hint);
  assert.equal(report(envChecks(work)), '', 'Fix these in capstone/envs:');
});

test('the tests include plan tests, failing-validation tests and mock tests', () => {
  assert.ok(work, hint);
  assert.equal(report(testChecks(work)), '', 'Fix these in capstone/tests:');
});

test('terraform fmt and terraform test pass', () => {
  assert.equal(fact('fmt_ok'), true, `Some files are not formatted. Run terraform fmt -recursive in capstone/. ${hint}`);
  assert.equal(fact('tests_failed_count'), 0, `terraform test failed. Read the failure that run.mjs printed. ${hint}`);
  assert.ok(fact('tests_passed_count') >= 8, `Write more run blocks: at least 8 pass (3 plan, 5 failing-validation or mock). ${hint}`);
});

test('both environments validate and the module refuses bad input in a real plan', () => {
  assert.equal(fact('validate_dev_ok'), true, hint);
  assert.equal(fact('validate_prod_ok'), true, hint);
  assert.equal(fact('bad_memory_rejected'), true, `A plan with memory_mb = 4096 must be refused by the module. ${hint}`);
  assert.equal(fact('bad_memory_error'), 'memory_mb must be between 16 and 256.', hint);
});

test('both environments were built for real: six objects each, one state each, no local state file', () => {
  assert.equal(fact('apply_dev_added_count'), 6, `Each environment adds two images, a volume, a network and two containers. ${hint}`);
  assert.equal(fact('apply_prod_added_count'), 6, hint);
  assert.equal(fact('containers_count'), 4, hint);
  assert.equal(fact('state_files_count'), 2, 'dev and prod must each have a state file on the state server.');
  assert.equal(fact('local_tfstate_files_count'), 0, 'No terraform.tfstate may appear in an environment folder: the state belongs on the state server.');
});

test('the platform works: the web container answers and reaches the cache over the network', () => {
  assert.equal(fact('web_dev_status'), 200, `The dev web container did not answer on http://127.0.0.1:18401. ${hint}`);
  assert.equal(fact('web_prod_status'), 200, `The prod web container did not answer on http://127.0.0.1:18402. ${hint}`);
  assert.equal(fact('web_reaches_cache'), '+PONG', 'The web container must reach the cache by name on the shared network.');
  assert.equal(fact('outputs_dev_keys_count'), 2, 'Each environment hands back web_url and cache_address.');
  assert.equal(fact('second_plan_dev_no_changes'), true, 'A plan right after the apply must say No changes.');
  assert.equal(fact('second_plan_prod_no_changes'), true, hint);
});

test('each environment has its own credential, and prod refuses to be destroyed', () => {
  assert.equal(fact('wrong_token_denied'), true, 'The dev token must not open the prod state.');
  assert.equal(fact('wrong_token_error'), 'Error loading state: HTTP remote state endpoint requires auth', hint);
  assert.equal(fact('prod_destroy_blocked'), true, 'terraform destroy in prod must be refused (prevent_destroy on the data volume).');
  assert.equal(fact('prod_destroy_error'), 'Instance cannot be destroyed', hint);
  assert.equal(fact('prod_containers_after_blocked_destroy_count'), 2, 'The refused destroy must leave both prod containers alone.');
});

test('destroy removed everything and nothing is left in Docker', () => {
  assert.equal(fact('destroy_dev_count'), 6, hint);
  assert.equal(fact('destroy_prod_count'), 6, hint);
  assert.equal(fact('leftover_count'), 0, 'Run: node toolkit/cleanup.mjs 14');
  assert.deepEqual(leftovers(14), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
