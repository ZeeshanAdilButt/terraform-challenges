// Challenge 11, part 2 test.
// Run: node --test challenges/challenge-11-pipeline/part-2-apply-saved-plan/test.mjs
// It loads findDestroys from the work folder (the copy run.mjs made of your ci/gate.mjs), reads ci/apply.mjs and
// reads the facts that run.mjs saved. It fails until the gate finds destroys and the apply step applies the plan file.
// That is on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';
import { leftovers } from '../../../toolkit/docker.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-11-pipeline/part-2-apply-saved-plan/run.mjs';
const work = workDir(import.meta.url);
const change = (address, ...actions) => ({ address, change: { actions } });

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work folder yet. ${hint}`);
  assert.notEqual(getFact('c11.p2.gate_clean_exit_code'), undefined, `No facts yet. ${hint}`);
});

test('findDestroys: deletes and replaces are found, creates and updates are not', async () => {
  assert.ok(work, hint);
  const { findDestroys } = await import(pathToFileURL(join(work, 'ci', 'gate.mjs')).href);
  const plan = {
    resource_changes: [
      change('a.create', 'create'),
      change('a.update', 'update'),
      change('a.noop', 'no-op'),
      change('a.delete', 'delete'),
      change('a.replace', 'delete', 'create'),
      change('a.cbd', 'create', 'delete'),
    ],
  };
  assert.deepEqual(findDestroys(plan), [
    { address: 'a.delete', action: 'delete' },
    { address: 'a.replace', action: 'replace' },
    { address: 'a.cbd', action: 'replace' },
  ], 'Return one { address, action } for each change whose actions include "delete": "replace" when it also creates, "delete" otherwise.');
  assert.deepEqual(findDestroys({}), [], 'A plan with no resource_changes destroys nothing.');
});

test('the apply step applies the saved plan file and never re-plans', () => {
  const text = work ? readFileSync(join(work, 'ci', 'apply.mjs'), 'utf8') : '';
  assert.doesNotMatch(text, /-auto-approve/, 'ci/apply.mjs must not use -auto-approve: that plans again at apply time. Pass the plan file to terraform apply instead.');
  assert.match(text, /\['apply',[^\]]*planFile/, "Give terraform apply the plan file: ['apply', '-input=false', planFile]");
});

test('a plan that only adds passes the gate', () => {
  assert.equal(getFact('c11.p2.gate_clean_exit_code'), 0);
});

test('a change merged after the review does not reach the apply', () => {
  assert.equal(getFact('c11.p2.unreviewed_change_applied'), false, 'The apply step applied a change that was not in the reviewed plan. Apply the plan file.');
  assert.equal(getFact('c11.p2.reviewed_apply_added_count'), 1);
  assert.equal(getFact('c11.p2.reviewed_apply_destroyed_count'), 0);
  assert.equal(getFact('c11.p2.pending_destroy_after_apply_count'), 1, 'The unreviewed change should still be waiting as a plan.');
});

test('a plan made against an old state is refused', () => {
  assert.equal(getFact('c11.p2.stale_plan_refused'), true, 'Applying a saved plan after the state moved must fail with "Saved plan is stale".');
  assert.notEqual(getFact('c11.p2.stale_exit_code'), 0);
});

test('a plan with destroys stops the pipeline before the apply', () => {
  assert.equal(getFact('c11.p2.gate_destroy_exit_code'), 1, 'The gate must exit with 1 when the plan destroys something.');
  assert.equal(getFact('c11.p2.gate_destroy_lines_count'), 2, 'Renaming the volume replaces the volume and the container: two lines.');
  assert.equal(getFact('c11.p2.apply_skipped_after_gate'), true);
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(11), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
