// Challenge 2, part 2 test.
// Run: node --test challenges/challenge-2-variables/part-2-outputs-and-sensitive/test.mjs
// Run run.mjs first. The test fails until the two outputs are marked sensitive and main.tf applies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-2-variables/part-2-outputs-and-sensitive/run.mjs';
const need = (name) => {
  const v = getFact(name);
  const stuck = getFact('c2.p2.apply_ok') === false ? ' The last run stopped because main.tf did not apply: add sensitive = true to output "db_password" and output "token_length", then run run.mjs again.' : '';
  assert.notEqual(v, undefined, `No fact ${name}.${stuck || ` ${hint}`}`);
  return v;
};

test('run.mjs has run: the facts exist', () => {
  need('c2.p2.apply_ok');
});

test('an output of a sensitive value without sensitive = true is refused', () => {
  assert.equal(need('c2.p2.unmarked_output_rejected'), true);
});

test('your main.tf applies', () => {
  assert.equal(
    need('c2.p2.apply_ok'),
    true,
    'main.tf did not apply. The error says "Output refers to sensitive values": add sensitive = true to output "db_password" and to output "token_length", then run run.mjs again.',
  );
  assert.equal(need('c2.p2.apply_added_count'), 2);
});

test('both secret outputs are marked sensitive, the name output is not', () => {
  assert.equal(need('c2.p2.sensitive_outputs_count'), 2, 'Exactly two outputs (db_password and token_length) must be sensitive. service_name is not a secret.');
});

test('apply and `terraform output` show <sensitive>, not the values', () => {
  assert.equal(need('c2.p2.apply_log_redacted'), true);
  assert.equal(need('c2.p2.output_list_redacted'), true);
});

test('asking by name, -raw or -json prints the secret anyway (measured)', () => {
  assert.equal(need('c2.p2.output_named_leaks'), true);
  assert.equal(need('c2.p2.output_raw_leaks'), true);
  assert.equal(need('c2.p2.output_json_leaks'), true);
});

test('terraform show hides the password, but a token leaks through the output attribute (measured)', () => {
  assert.equal(need('c2.p2.show_hides_password'), true);
  assert.equal(need('c2.p2.show_leaks_token_in_output_attribute'), true);
});

test('the state file holds the secrets in clear text (measured)', () => {
  assert.equal(need('c2.p2.state_has_password'), true);
  assert.equal(need('c2.p2.state_has_token'), true);
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
