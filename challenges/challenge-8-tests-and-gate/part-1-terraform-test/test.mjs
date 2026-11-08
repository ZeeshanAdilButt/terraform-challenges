// Challenge 8, part 1 test.
// Run: node --test challenges/challenge-8-tests-and-gate/part-1-terraform-test/test.mjs
// It reads the numbers run.mjs saved from your last run. It fails until the tests pass. That is on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-8-tests-and-gate/part-1-terraform-test/run.mjs';
const fact = (k) => getFact(`c8.p1.${k}`);

/** Names of the run blocks that failed in the last terraform test output, for a useful message. */
function failedRuns() {
  const w = workDir(import.meta.url);
  const f = w && join(w, 'test-output.txt');
  if (!f || !existsSync(f)) return '';
  return [...readFileSync(f, 'utf8').matchAll(/run "([^"]+)"\.\.\. fail/g)].map((m) => m[1]).join(', ');
}

test('run.mjs has been run', () => {
  assert.notEqual(fact('init_ok'), undefined, `No facts yet. ${hint}`);
});

test('init works', () => {
  assert.equal(fact('init_ok'), true, `terraform init failed. ${hint}`);
});

test('no run block fails', () => {
  const failed = failedRuns();
  assert.equal(
    fact('test_failed_count'),
    0,
    `${fact('test_failed_count')} run block(s) fail${failed ? `: ${failed}` : ''}. Read the error terraform test printed: it names the condition and shows the actual value. Then decide: is the code wrong or the test? ${hint}`,
  );
});

test('you added the sixth test: a port that is too high is refused', () => {
  assert.ok(fact('test_block_count') >= 5, `tests/main.tftest.hcl has ${fact('test_block_count')} run blocks; add the one the TODO asks for (port = 70000, expect_failures = [var.port]). ${hint}`);
  assert.ok(fact('test_passed_count') >= 5, `Expected at least 5 passing runs, got ${fact('test_passed_count')}. ${hint}`);
});

test('the apply run cleaned up after itself', () => {
  assert.equal(fact('file_left_after_test'), false, 'out/shop.conf is still there after terraform test.');
});

test('the tests notice a broken config', () => {
  assert.equal(fact('mutant_caught'), true, `The run changes the rendered port in a copy of main.tf and expects the tests to fail. They did not. Is there a run that checks the rendered port? ${hint}`);
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});
