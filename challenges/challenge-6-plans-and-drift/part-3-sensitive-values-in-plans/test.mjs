// Challenge 6, part 3 test.
// Run: node --test challenges/challenge-6-plans-and-drift/part-3-sensitive-values-in-plans/test.mjs
// It compares your predictions.json with what the last run.mjs found. It fails until every prediction is right.
// That is on purpose: run.mjs shows each place, and the facts hold the truth.
// To test the reference solution instead: set TFC_REFERENCE=1 for both run.mjs and this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { leftovers } from '../../../toolkit/docker.js';
import { workDir } from '../../../toolkit/part.js';
import { partFile } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-6-plans-and-drift/part-3-sensitive-values-in-plans/run.mjs';
const KEYS = [
  'plan_text_shows_variable_secret',
  'plan_json_shows_variable_secret',
  'plan_json_shows_random_secret',
  'plan_file_shows_variable_secret',
  'state_file_shows_variable_secret',
  'state_file_shows_random_secret',
  'show_state_text_shows_any_secret',
  'output_text_shows_random_secret',
  'output_json_shows_random_secret',
];

test('run.mjs has run (work/ exists)', () => {
  assert.ok(workDir(import.meta.url), `There is no work/ folder yet. ${hint}`);
});

test('predictions.json is valid and answers every question with true or false', () => {
  const p = JSON.parse(partFile(import.meta.url, 'predictions.json'));
  for (const k of KEYS) assert.ok(typeof p[k] === 'boolean', `predictions.json needs "${k}": true or false.`);
});

for (const k of KEYS) {
  test(`prediction: ${k}`, () => {
    const p = JSON.parse(partFile(import.meta.url, 'predictions.json'));
    const found = getFact(`c6.p3.${k}`);
    assert.notEqual(found, undefined, `No fact for ${k}. ${hint}`);
    assert.equal(p[k], found, `You said ${p[k]}, run.mjs found ${found}. Read the step that looks at this place in the output of run.mjs (or in results.md), fix predictions.json, run again.`);
  });
}

test('the last run: the plan JSON carries the sensitive flag, and the random password is unknown at plan time', () => {
  assert.equal(getFact('c6.p3.plan_json_sensitive_flag_set'), true, hint);
  assert.equal(getFact('c6.p3.random_password_unknown_in_plan'), true, hint);
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
