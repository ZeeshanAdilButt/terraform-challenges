// Challenge 7, part 1 test.
// Run: node --test challenges/challenge-7-a-module/part-1-build-and-call/test.mjs
// It reads the numbers run.mjs saved from your last run. It fails until the module is fixed. That is on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-7-a-module/part-1-build-and-call/run.mjs';
const fact = (k) => getFact(`c7.p1.${k}`);

test('run.mjs has been run', () => {
  assert.notEqual(fact('init_ok'), undefined, `No facts yet. ${hint}`);
});

test('init works: the module names the provider it needs and has no provider block of its own', () => {
  assert.equal(fact('init_ok'), true, `terraform init failed. Read its error in the run output: a module must not configure a provider (the caller does), and it must say which provider it needs in a required_providers block. ${hint}`);
});

test('the plan is clean: five resources to add', () => {
  assert.equal(fact('plan_add_count'), 5, `Expected 5 to add (image, 2 networks, 2 containers). ${hint}`);
});

test('the module can be called twice: the container name comes from the input', () => {
  assert.equal(fact('apply_ok'), true, `apply failed. Two instances of the module cannot share one container name: use var.name. ${hint}`);
  assert.equal(fact('module_instances_count'), 2, `Expected 2 module instances in state. ${hint}`);
});

test('the module outputs are an interface: container_name, network_name, ip_address, and nothing else', () => {
  assert.equal(fact('output_leaks_token'), false, `The module hands out the whole container, including its env (the fake token). Remove the output "container" and keep only what a caller needs. ${hint}`);
  assert.equal(fact('output_keys_count'), 3, `Expected exactly 3 outputs per instance. ${hint}`);
});

test('the module refuses an environment it does not know', () => {
  assert.equal(fact('environment_validation_rejects'), true, `Add a validation block to variable "environment": only dev, staging and prod. ${hint}`);
});

test('the module refuses a memory limit outside 16 to 256 MB', () => {
  assert.equal(fact('memory_validation_rejects'), true, `Add a validation block to variable "memory_mb": between 16 and 256. ${hint}`);
});

test('a second plan has nothing to do', () => {
  assert.equal(fact('second_plan_changes_count'), 0, `Plan after apply should show no changes. ${hint}`);
});

test('destroy removed all five resources and nothing is left in Docker', () => {
  assert.equal(fact('destroyed_count'), 5, hint);
  assert.equal(fact('leftover_count'), 0, 'Run: node toolkit/cleanup.mjs 7');
  assert.deepEqual(leftovers(7), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});
