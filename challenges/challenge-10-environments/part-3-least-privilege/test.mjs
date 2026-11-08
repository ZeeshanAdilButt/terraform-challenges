// Challenge 10, part 3 test.
// Run: node --test challenges/challenge-10-environments/part-3-least-privilege/test.mjs
// It reads the work folder and the facts that run.mjs saved. It fails until no token sits in a file and every
// identity is limited to its own environment. That is on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';
import { leftovers } from '../../../toolkit/docker.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-10-environments/part-3-least-privilege/run.mjs';
const work = workDir(import.meta.url);
const read = (p) => (work && existsSync(join(work, p)) ? readFileSync(join(work, p), 'utf8') : '');

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work folder yet. ${hint}`);
  assert.notEqual(getFact('c10.p3.secrets_in_files_count'), undefined, `No facts yet. ${hint}`);
});

test('no token is written in a file', () => {
  for (const e of ['dev', 'prod']) {
    assert.doesNotMatch(read(`envs/${e}/backend.hcl`), /^\s*password\s*=/m, `envs/${e}/backend.hcl holds a password. It would be in Git and in every clone. Delete the line: the password comes from TF_HTTP_PASSWORD.`);
  }
  assert.equal(getFact('c10.p3.secrets_in_files_count'), 0, 'run.mjs found a token in a file of the work folder.');
});

test('the policy gives each CI identity one environment', () => {
  const policy = JSON.parse(read('identities.json') || '{}');
  assert.deepEqual(policy['ci-dev'], ['dev'], 'The CI job for dev must be allowed to use dev only.');
  assert.deepEqual(policy['ci-prod'], ['prod']);
  assert.deepEqual(policy['dev-engineer'], ['dev']);
});

test('a developer with the dev token can work in dev and cannot touch prod', () => {
  assert.equal(getFact('c10.p3.dev_engineer_dev_ok'), true);
  assert.equal(getFact('c10.p3.dev_engineer_prod_denied'), true, 'The developer reached prod. Something in a file or in the policy gives the developer the prod token.');
});

test('a laptop with no credentials gets nowhere', () => {
  assert.equal(getFact('c10.p3.nobody_denied'), true, 'An identity with no token was let in. Look for a password in envs/*/backend.hcl.');
});

test('each CI job works in its own environment only', () => {
  assert.equal(getFact('c10.p3.ci_dev_dev_ok'), true);
  assert.equal(getFact('c10.p3.ci_dev_apply_ok'), true);
  assert.equal(getFact('c10.p3.ci_dev_prod_denied'), true, 'The CI job for dev reached prod. Remove "prod" from its entry in identities.json.');
  assert.equal(getFact('c10.p3.ci_prod_prod_ok'), true);
  assert.equal(getFact('c10.p3.ci_prod_dev_denied'), true);
});

test('denied requests change nothing', () => {
  assert.ok(getFact('c10.p3.denied_requests_count') >= 4, 'The server should have answered 401 to several requests.');
  assert.equal(getFact('c10.p3.prod_serial_unchanged'), true);
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(10), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
