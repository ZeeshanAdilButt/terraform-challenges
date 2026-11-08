// Challenge 8, part 3 test.
// Run: node --test challenges/challenge-8-tests-and-gate/part-3-plan-gate/test.mjs
// It loads the gate.mjs that run.mjs copied to work/ (your file, or the reference with --reference),
// feeds it small made-up plans, and reads the numbers of the last run. It fails until the gate works.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-8-tests-and-gate/part-3-plan-gate/run.mjs';
const fact = (k) => getFact(`c8.p3.${k}`);

const work = workDir(import.meta.url);
const gateFile = work && join(work, 'gate.mjs');
const gate = gateFile ? await import(pathToFileURL(gateFile).href) : null;

const label = (value) => [{ label: 'tfc.challenge', value: '8' }, { label: 'tfc.protected', value }];
const change = (address, actions, beforeLabels, afterLabels = beforeLabels) => ({
  address,
  type: 'docker_container',
  change: { actions, before: beforeLabels ? { labels: beforeLabels } : null, after: afterLabels ? { labels: afterLabels } : null },
});
const plan = (...resource_changes) => ({ format_version: '1.2', resource_changes });

test('run.mjs has been run', () => {
  assert.ok(gate, `There is no work/gate.mjs yet. ${hint}`);
});

test('a protected resource that is replaced is blocked', () => {
  const v = gate.findViolations(plan(change('docker_container.db[0]', ['delete', 'create'], label('true'))));
  assert.equal(v.length, 1, 'A replacement has the actions ["delete","create"]. The resource is tagged protected (label tfc.protected = "true"), so it must be reported.');
  assert.equal(v[0].address, 'docker_container.db[0]');
});

test('a protected resource that is destroyed is blocked', () => {
  const v = gate.findViolations(plan(change('docker_container.db[0]', ['delete'], label('true'), null)));
  assert.equal(v.length, 1, 'A plain destroy has the actions ["delete"].');
});

test('an unprotected resource may be replaced or destroyed', () => {
  assert.deepEqual(gate.findViolations(plan(change('docker_container.web', ['delete', 'create'], label('false')))), []);
  assert.deepEqual(gate.findViolations(plan(change('docker_container.web', ['delete'], [{ label: 'tfc.challenge', value: '8' }], null))), []);
});

test('creating or updating a protected resource is allowed', () => {
  assert.deepEqual(gate.findViolations(plan(change('docker_container.db[0]', ['create'], null, label('true')))), [], 'A create has before = null: nothing exists yet, so nothing to protect.');
  assert.deepEqual(gate.findViolations(plan(change('docker_container.db[0]', ['update'], label('true')))), []);
  assert.deepEqual(gate.findViolations(plan(change('docker_container.db[0]', ['no-op'], label('true')))), []);
});

test('the tag is read from the existing resource (before), not from the plan (after)', () => {
  const v = gate.findViolations(plan(change('docker_container.db[0]', ['delete', 'create'], label('true'), label('false'))));
  assert.equal(v.length, 1, 'This plan removes the label and replaces the container in one step. The container is protected now, so it must be blocked.');
});

test('the script exits 1 when blocked, 0 when fine, 2 when the input is not a plan', () => {
  const run = (input) => spawnSync(process.execPath, [gateFile], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run(plan(change('docker_container.db[0]', ['delete'], label('true'), null))).status, 1);
  assert.equal(run(plan(change('docker_container.web', ['update'], label('false')))).status, 0);
  assert.equal(run({ nothing: true }).status, 2);
});

test('a plan that terraform could not finish (errored: true) is blocked', () => {
  const r = spawnSync(process.execPath, [gateFile], { input: JSON.stringify({ errored: true, resource_changes: [] }), encoding: 'utf8' });
  assert.equal(r.status, 1, 'terraform writes a plan file even when planning fails, with "errored": true. Apply refuses it, so the gate must too.');
});

test('the real plans: the web replacement passes, both database plans are blocked', () => {
  assert.equal(fact('gate_web_replace_exit_code'), 0, `Replacing the web container must pass the gate. ${hint}`);
  assert.equal(fact('gate_db_replace_exit_code'), 1, `Replacing the database must be blocked. ${hint}`);
  assert.equal(fact('gate_db_remove_exit_code'), 1, `Removing the database must be blocked. ${hint}`);
  assert.equal(fact('gate_blocked_lines_count'), 2, hint);
});

test('a check block warns and carries on; a precondition stops the plan but still leaves a plan file', () => {
  assert.equal(fact('check_warns_and_continues'), true, hint);
  assert.equal(fact('precondition_stops_plan'), true, hint);
  assert.equal(fact('errored_plan_file_written'), true, hint);
  assert.equal(fact('errored_plan_json_errored'), true, hint);
  assert.equal(fact('errored_plan_apply_error'), 'Cannot apply incomplete plan', hint);
});

test('the Terraform Policy attempt was recorded: the plugin is missing and the exit code is still 0', () => {
  assert.equal(fact('policy_plugin_missing'), true, hint);
  assert.equal(fact('policy_exit_code'), 0, hint);
});

test('destroy removed everything and nothing is left in Docker', () => {
  assert.equal(fact('baseline_added_count'), 4, hint);
  assert.equal(fact('destroyed_count'), 4, hint);
  assert.equal(fact('leftover_count'), 0, 'Run: node toolkit/cleanup.mjs 8');
  assert.deepEqual(leftovers(8), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});
