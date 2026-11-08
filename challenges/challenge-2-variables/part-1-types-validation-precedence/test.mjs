// Challenge 2, part 1 test.
// Run: node --test challenges/challenge-2-variables/part-1-types-validation-precedence/test.mjs
// Fill in predictions.json and fix variables.tf, run run.mjs, then run this. It fails until both are right.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-2-variables/part-1-types-validation-precedence/run.mjs';
const need = (name) => {
  const v = getFact(name);
  assert.notEqual(v, undefined, `No fact ${name}. ${hint}`);
  return v;
};

test('run.mjs has run: the facts exist', () => {
  need('c2.p1.missing_required_rejected');
});

test('a variable with no default and no value stops Terraform', () => {
  assert.equal(need('c2.p1.missing_required_rejected'), true);
});

test('replicas is declared as a number', () => {
  assert.equal(need('c2.p1.replicas_type_text'), 'number', 'In variables.tf, change type = string to type = number for "replicas". A count is a number.');
});

test('validation: project must be 3 to 12 lowercase letters and digits', () => {
  assert.equal(
    need('c2.p1.bad_name_rejected'),
    true,
    'project=Bad_Name was accepted. Add a validation block to variable "project": condition = can(regex("^[a-z0-9]{3,12}$", var.project)) and an error_message.',
  );
});

test('validation: replicas must be a whole number from 1 to 5', () => {
  assert.equal(need('c2.p1.replicas_too_high_rejected'), true, 'replicas=9 was accepted. Add a validation block to variable "replicas": it must be at most 5 (and at least 1).');
  assert.equal(need('c2.p1.replicas_fraction_rejected'), true, 'replicas=2.5 was accepted. A whole number means var.replicas == floor(var.replicas).');
});

test('validation is not too strict: a good value passes', () => {
  assert.equal(need('c2.p1.good_values_accepted'), true, 'project=daftar and replicas=3 were rejected. Loosen the condition.');
});

test('type constraints convert text and reject nonsense', () => {
  assert.equal(need('c2.p1.string_converted_to_number'), true);
  assert.equal(need('c2.p1.type_error_number_rejected'), true, 'replicas=abc was accepted, so replicas is not a number type. Fix its type.');
  assert.equal(need('c2.p1.type_error_list_rejected'), true);
});

const DUELS = [
  ['duel1_env_vs_tfvars', 'TF_VAR_greeting versus terraform.tfvars'],
  ['duel2_tfvars_vs_tfvars_json', 'terraform.tfvars versus terraform.tfvars.json'],
  ['duel3_tfvars_vs_auto', 'terraform.tfvars versus a.auto.tfvars'],
  ['duel4_auto_a_vs_auto_b', 'a.auto.tfvars versus b.auto.tfvars'],
  ['duel5_auto_vs_var_file', '*.auto.tfvars versus -var-file'],
  ['duel6_var_file_then_var', '-var-file first, then -var'],
  ['duel7_var_then_var_file', '-var first, then -var-file'],
];
for (const [key, label] of DUELS) {
  test(`precedence: ${label}`, () => {
    const real = need(`c2.p1.${key}_winner_text`);
    const work = join(here, 'work', 'predictions.json');
    const said = existsSync(work) ? JSON.parse(readFileSync(work, 'utf8'))[key] : '';
    assert.equal(said, real, `You wrote "${said || 'nothing'}" for ${key}; Terraform used "${real}". Edit predictions.json, then run run.mjs again (the test reads the copy run.mjs used).`);
  });
}

test('the documented order holds when sources are added one at a time', () => {
  assert.equal(need('c2.p1.documented_order_holds'), true);
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
