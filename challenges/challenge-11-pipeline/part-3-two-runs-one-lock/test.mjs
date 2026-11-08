// Challenge 11, part 3 test.
// Run: node --test challenges/challenge-11-pipeline/part-3-two-runs-one-lock/test.mjs
// It reads ci/pipeline.mjs from the work folder and the facts that run.mjs saved. It fails until the pipeline
// uses the state lock instead of switching it off. That is on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';
import { leftovers } from '../../../toolkit/docker.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-11-pipeline/part-3-two-runs-one-lock/run.mjs';
const work = workDir(import.meta.url);
const pipeline = () => (work && existsSync(join(work, 'ci', 'pipeline.mjs')) ? readFileSync(join(work, 'ci', 'pipeline.mjs'), 'utf8') : '');

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work folder yet. ${hint}`);
  assert.notEqual(getFact('c11.p3.pipeline_has_lock_false'), undefined, `No facts yet. ${hint}`);
});

test('the pipeline never switches the lock off', () => {
  assert.doesNotMatch(pipeline().replace(/^\s*\/\/.*$/gm, ''), /-lock=false/, '-lock=false lets two runs write the same state at the same time. Remove it.');
});

test('the pipeline passes a lock timeout read from LOCK_TIMEOUT', () => {
  const text = pipeline();
  assert.match(text, /LOCK_TIMEOUT/, 'Read the timeout from process.env.LOCK_TIMEOUT, with 0s as the default.');
  assert.match(text, /-lock-timeout=/, 'Give plan and apply the flag -lock-timeout=<timeout>.');
});

test('a second run with no patience fails at once and says who holds the lock', () => {
  assert.notEqual(getFact('c11.p3.fast_fail_exit_code'), 0, 'The second run did not fail. It never asked for the lock.');
  assert.equal(getFact('c11.p3.fast_fail_error_text'), 'Error acquiring the state lock');
  assert.equal(getFact('c11.p3.fast_fail_shows_lock_info'), true, 'The error should show the Lock Info block, with Operation: OperationTypeApply.');
  assert.equal(getFact('c11.p3.fast_fail_first_run_ok'), true, 'The first run must finish; the second one must not break it.');
});

test('a second run with patience waits for the lock, then applies', () => {
  assert.equal(getFact('c11.p3.waited_runs_ok_count'), 3, 'In all three repetitions both runs must end with exit code 0.');
  assert.ok(getFact('c11.p3.wait_median_s') >= 2, 'The second run should have waited for the first apply to release the lock.');
  assert.equal(getFact('c11.p3.final_state_is_second_count'), 3, 'The second run applies last, so its message must be the one in the container.');
});

test('every lock that was taken was released', () => {
  assert.ok(getFact('c11.p3.lock_denied_count') >= 4, 'Waiting runs ask again and again: the server should have refused several requests.');
  assert.equal(getFact('c11.p3.unlock_count'), getFact('c11.p3.lock_granted_count'));
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(11), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
