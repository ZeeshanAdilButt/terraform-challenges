// Challenge 9, part 1 test.
// Run: node --test challenges/challenge-9-secrets/part-1-find-the-secret/test.mjs
// It reads the numbers run.mjs saved from your last run: did your predictions match what was found?
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-9-secrets/part-1-find-the-secret/run.mjs';
const fact = (k) => getFact(`c9.p1.${k}`);

const PLACES = [
  ['terraform.tfstate', 'tfstate'],
  ['terraform.tfstate.backup', 'tfstate_backup'],
  ['terraform show -json', 'show_json_state'],
  ['terraform output (no flags)', 'output_human'],
  ['terraform output -json', 'output_json'],
  ['terraform plan (the text you read)', 'plan_text'],
  ['terraform show -json <planfile>', 'show_json_plan'],
  ['app.conf (the file Terraform wrote)', 'app_conf'],
  ['TF_LOG=TRACE output', 'trace_log'],
];

test('run.mjs has been run', () => {
  assert.notEqual(fact('init_ok'), undefined, `No facts yet. ${hint}`);
  assert.equal(fact('apply_ok'), true, `The apply failed. ${hint}`);
});

const w = workDir(import.meta.url);
const predFile = w && join(w, 'predictions.json');
const predictions = predFile && existsSync(predFile) ? JSON.parse(readFileSync(predFile, 'utf8')) : {};

for (const [key, name] of PLACES) {
  test(`${key}: your prediction matches what the run found`, () => {
    assert.equal(
      predictions[key],
      fact(`found_${name}`),
      `You predicted ${predictions[key]}; the run found ${fact(`found_${name}`)}. Look at the step for this place in the run output, then edit predictions.json and run run.mjs again. ${hint}`,
    );
  });
}

test('the generated password is in state too, not only the value you passed in', () => {
  assert.equal(fact('generated_in_state'), true, hint);
  assert.equal(fact('generated_in_output_json'), true, hint);
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});
