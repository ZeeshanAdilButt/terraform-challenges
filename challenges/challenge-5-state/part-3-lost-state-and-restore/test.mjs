// Challenge 5, part 3 test.
// Run: node --test challenges/challenge-5-state/part-3-lost-state-and-restore/test.mjs
// It reads your main.tf and the facts the last run.mjs saved.
// It fails until adopting the container with import no longer wants to destroy it. That is on purpose.
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
const hint = 'Run: node challenges/challenge-5-state/part-3-lost-state-and-restore/run.mjs';

test('run.mjs has run (work/ exists)', () => {
  assert.ok(workDir(import.meta.url), `There is no work/ folder yet. ${hint}`);
});

test('main.tf has a lifecycle block that ignores env and labels', () => {
  const tf = partFile(import.meta.url, 'main.tf').replace(/^\s*#.*$/gm, '');
  const m = /ignore_changes\s*=\s*\[([^\]]*)\]/.exec(tf);
  assert.ok(m, 'FIX: add lifecycle { ignore_changes = [ ... ] } to docker_container.app. Read the plan after the import in the output of run.mjs: which arguments say "forces replacement"?');
  for (const a of ['env', 'labels']) assert.match(m[1], new RegExp(`\\b${a}\\b`), `ignore_changes must name ${a}: the plan after the import says it forces replacement (image may be needed too, depending on how the container was made).`);
});

test('the last run: losing the state made the plan want to create everything, and the apply hit a name conflict', () => {
  assert.equal(getFact('c5.p3.plan_lost_add_count'), 2, hint);
  assert.notEqual(getFact('c5.p3.apply_lost_exit_code'), 0, hint);
  assert.match(String(getFact('c5.p3.apply_conflict_error')), /is already in use by container/, hint);
});

test('the last run: another apply overwrote the backup, so the copy aside was the one that saved us', () => {
  assert.equal(getFact('c5.p3.backup_resources_before_count'), 1, hint);
  assert.equal(getFact('c5.p3.backup_has_container_after_first_failed_apply'), true, hint);
  assert.equal(getFact('c5.p3.backup_has_container_after_replace_apply'), false, hint);
});

test('the last run: recovery A (restore the backup) ends with No changes and the same container', () => {
  assert.equal(getFact('c5.p3.restore_plan_add_count'), 1, `The restored backup should leave exactly one thing to add (the release record). ${hint}`);
  assert.equal(getFact('c5.p3.restore_plan_destroy_count'), 0, hint);
  assert.equal(getFact('c5.p3.restore_final_no_changes'), true, hint);
  assert.equal(getFact('c5.p3.restore_container_id_unchanged'), true, hint);
});

test('the last run: recovery B (import) does not destroy the container you adopt', () => {
  assert.equal(getFact('c5.p3.import_exit_code'), 0, hint);
  assert.equal(getFact('c5.p3.import_plan_destroy_count'), 0, `After the import the plan wanted to destroy ${getFact('c5.p3.import_plan_destroy_count')} thing(s), with ${getFact('c5.p3.import_plan_forces_replacement_count')} "forces replacement" line(s). Fix main.tf, then ${hint}`);
  assert.equal(getFact('c5.p3.import_final_no_changes'), true, hint);
  assert.equal(getFact('c5.p3.import_container_id_unchanged'), true, hint);
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(5), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
