// Challenge 9, part 2 test.
// Run: node --test challenges/challenge-9-secrets/part-2-ephemeral/test.mjs
// It reads the numbers run.mjs saved from your last run. It fails until the password is ephemeral.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-9-secrets/part-2-ephemeral/run.mjs';
const fact = (k) => getFact(`c9.p2.${k}`);

test('run.mjs has been run', () => {
  assert.notEqual(fact('init_ok'), undefined, `No facts yet. ${hint}`);
});

test('the apply works and the consumer received the password', () => {
  assert.equal(fact('init_ok'), true, hint);
  assert.equal(fact('apply_ok'), true, hint);
  assert.equal(fact('vault_file_has_secret'), true, `vault.out should hold the password: the store command must still get it. ${hint}`);
});

test('the password is not in state', () => {
  assert.equal(fact('secret_in_state'), false, `The password is in terraform.tfstate. Change resource "random_password" into ephemeral "random_password" and refer to it as ephemeral.random_password.db.result. ${hint}`);
});

test('the password is not in terraform show -json', () => {
  assert.equal(fact('secret_in_show_json'), false, hint);
});

test('the password is not in a saved plan', () => {
  assert.equal(fact('secret_in_plan_file'), false, hint);
});

test('the store command ran at least once during apply', () => {
  assert.ok(fact('command_runs_after_apply_count') >= 1, hint);
});

test('Terraform refuses an ephemeral value where it would be saved', () => {
  assert.equal(fact('demo_ephemeral_into_resource_error'), 'Invalid use of ephemeral value', hint);
});

test('none of the course providers has a write-only attribute, and three ephemeral resources exist', () => {
  assert.equal(fact('write_only_attribute_count'), 0, hint);
  assert.ok(fact('ephemeral_resource_count') >= 3, hint);
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});
