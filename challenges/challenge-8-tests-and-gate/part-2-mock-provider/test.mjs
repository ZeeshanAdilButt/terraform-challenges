// Challenge 8, part 2 test.
// Run: node --test challenges/challenge-8-tests-and-gate/part-2-mock-provider/test.mjs
// It reads the numbers run.mjs saved from your last run. It fails until the mocked tests pass. That is on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leftovers } from '../../../toolkit/docker.js';
import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-8-tests-and-gate/part-2-mock-provider/run.mjs';
const fact = (k) => getFact(`c8.p2.${k}`);

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

test('no mocked run fails', () => {
  const failed = failedRuns();
  assert.equal(
    fact('test_failed_count'),
    0,
    `${fact('test_failed_count')} run(s) fail${failed ? `: ${failed}` : ''}. A mock invents computed values and a made-up list is empty. Add a mock_resource "docker_container" block with defaults for network_data. ${hint}`,
  );
});

test('you added the url test', () => {
  assert.ok(fact('test_block_count') >= 4, `tests/mock.tftest.hcl has ${fact('test_block_count')} run blocks; add "url_has_the_port" (port = 9090, url "http://10.0.0.5:9090"). ${hint}`);
  assert.ok(fact('test_passed_count') >= 4, `Expected at least 4 passing runs, got ${fact('test_passed_count')}. ${hint}`);
});

test('the mocked tests ran without Docker, and a real apply could not', () => {
  assert.equal(fact('apply_without_docker_fails'), true, hint);
});

test('a real apply disagreed with the mocked tests: the name was already taken', () => {
  assert.equal(fact('real_apply_conflict'), true, hint);
  assert.equal(fact('real_apply_after_removal_ok'), true, hint);
  assert.equal(fact('real_ip_differs_from_mock'), true, hint);
});

test('nothing is left in Docker', () => {
  assert.equal(fact('leftover_count'), 0, 'Run: node toolkit/cleanup.mjs 8');
  assert.deepEqual(leftovers(8), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});
