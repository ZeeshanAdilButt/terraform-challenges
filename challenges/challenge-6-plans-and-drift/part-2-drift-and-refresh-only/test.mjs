// Challenge 6, part 2 test.
// Run: node --test challenges/challenge-6-plans-and-drift/part-2-drift-and-refresh-only/test.mjs
// It runs drift.mjs on exit codes and on the recorded refresh-only plan (fixtures/drift-plan.json), then checks the
// facts the last run.mjs saved. It fails until drift.mjs is fixed. That is on purpose.
// To test the reference solution instead: set TFC_REFERENCE=1 for both run.mjs and this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { leftovers } from '../../../toolkit/docker.js';
import { useReference, workDir } from '../../../toolkit/part.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-6-plans-and-drift/part-2-drift-and-refresh-only/run.mjs';
const file = useReference() ? join(here, 'reference', 'drift.mjs') : join(here, 'drift.mjs');
const { verdict, driftedAddresses } = await import(pathToFileURL(file).href);
const fixture = JSON.parse(readFileSync(join(here, 'fixtures', 'drift-plan.json'), 'utf8'));

test('run.mjs has run (work/ exists)', () => {
  assert.ok(workDir(import.meta.url), `There is no work/ folder yet. ${hint}`);
});

test('verdict: 0 is clean, 2 is changes', () => {
  assert.equal(verdict(0), 'clean');
  assert.equal(verdict(2), 'changes');
});

test('verdict: 1 is an error, not drift', () => {
  assert.equal(verdict(1), 'error', 'FIX 1: with -detailed-exitcode, exit code 1 means Terraform failed. Only 2 means there are changes.');
});

test('driftedAddresses: reads resource_drift of a refresh-only plan', () => {
  assert.deepEqual(driftedAddresses(fixture), ['docker_container.app'], 'FIX 2: a refresh-only plan has no resource_changes. Look at resource_drift.');
  assert.deepEqual(driftedAddresses({ resource_drift: [{ address: 'b.x' }, { address: 'a.y' }] }), ['a.y', 'b.x'], 'The addresses must be sorted.');
  assert.deepEqual(driftedAddresses({}), [], 'No drift key at all: an empty list.');
});

test('the last run: exit codes 0, 1 and 2 were seen, and your verdict named them', () => {
  assert.equal(getFact('c6.p2.exit_code_clean'), 0, hint);
  assert.equal(getFact('c6.p2.exit_code_error'), 1, hint);
  assert.equal(getFact('c6.p2.exit_code_rename_plan'), 2, hint);
  assert.equal(getFact('c6.p2.verdict_clean'), 'clean', hint);
  assert.equal(getFact('c6.p2.verdict_error'), 'error', `Your verdict() called the error exit code something else. ${hint}`);
  assert.equal(getFact('c6.p2.verdict_changes'), 'changes', hint);
});

test('the last run: your driftedAddresses found the renamed container', () => {
  assert.equal(getFact('c6.p2.drifted_addresses'), 'docker_container.app', `driftedAddresses() found: ${getFact('c6.p2.drifted_addresses')}. ${hint}`);
});

test('the last run: the drift behaved as recorded', () => {
  assert.equal(getFact('c6.p2.rename_plan_destroy_count'), 1, hint);
  assert.equal(getFact('c6.p2.exit_code_refresh_only_plan'), 2, hint);
  assert.equal(getFact('c6.p2.refresh_only_resource_changes_count'), 0, hint);
  assert.equal(getFact('c6.p2.exit_code_plan_after_refresh_only_apply'), 2, hint);
  assert.equal(getFact('c6.p2.exit_code_after_revert'), 0, hint);
  assert.equal(getFact('c6.p2.exit_code_after_start'), 0, hint);
  assert.equal(getFact('c6.p2.minimal_refresh_sees_stop'), false, hint);
  assert.equal(getFact('c6.p2.full_plan_exit_code_after_stop'), 2, hint);
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(6), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
