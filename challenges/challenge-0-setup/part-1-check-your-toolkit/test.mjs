// Challenge 0, part 1 test.
// Run: node --test challenges/challenge-0-setup/part-1-check-your-toolkit/test.mjs
// Run run.mjs first. The test fails until main.tf has the two fixes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-0-setup/part-1-check-your-toolkit/run.mjs';
const need = (name) => {
  const v = getFact(name);
  assert.notEqual(v, undefined, `No fact ${name}. ${hint}`);
  return v;
};

test('run.mjs has run: the facts exist', () => {
  need('c0.p1.init_ok');
});

test('the setup check has no FAIL line', () => {
  assert.equal(
    need('c0.p1.setup_checks_failed_count'),
    0,
    'node toolkit/check-setup.mjs printed a FAIL line. Fix what it names (Node 22, Docker running, 2 GB free), then run run.mjs again.',
  );
});

test('Terraform runs and is version 1.17 or newer', () => {
  const [major, minor] = need('c0.p1.tool_version').split('.').map(Number);
  assert.ok(
    major > 1 || (major === 1 && minor >= 17),
    `Found version ${getFact('c0.p1.tool_version')}. The challenges need Terraform 1.17 or newer (or the container: TFC_MODE=docker).`,
  );
  assert.ok(['docker', 'local'].includes(need('c0.p1.runner_mode')));
});

test('init and validate worked, and init wrote a lock file', () => {
  assert.equal(need('c0.p1.init_ok'), true, 'terraform init failed. Read its output in the run.mjs printout.');
  assert.equal(need('c0.p1.validate_ok'), true, 'terraform validate failed. Read its output in the run.mjs printout.');
  assert.equal(need('c0.p1.lock_file_exists'), true, 'No .terraform.lock.hcl for hashicorp/random in the work folder.');
});

test('main.tf pins the random provider to the 3.9 line', () => {
  assert.equal(
    need('c0.p1.provider_pinned'),
    true,
    'In required_providers, add version = "~> 3.9" under the source line of random. A pin keeps init from picking a surprise version.',
  );
});

test('the pet name has three words', () => {
  assert.equal(need('c0.p1.pet_words_count'), 3, 'Set length = 3 on random_pet.toolkit (a name of three words), then run run.mjs again.');
});

test('the first plan adds one resource, and apply and destroy agree', () => {
  assert.equal(need('c0.p1.plan_add_count'), 1);
  assert.equal(need('c0.p1.apply_added_count'), 1);
  assert.equal(need('c0.p1.destroy_destroyed_count'), 1);
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
