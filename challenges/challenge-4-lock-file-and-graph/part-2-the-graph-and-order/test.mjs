// Challenge 4, part 2 test.
// Run: node --test challenges/challenge-4-lock-file-and-graph/part-2-the-graph-and-order/test.mjs
// It reads your files (ordering/main.tf, reads/main.tf) and the facts the last run.mjs saved.
// It fails until you have made both fixes and run run.mjs. That is on purpose.
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
const hint = 'Run: node challenges/challenge-4-lock-file-and-graph/part-2-the-graph-and-order/run.mjs';
const noComments = (s) => s.replace(/^\s*#.*$/gm, '');

/** The text of one block, from its header to the first line that is just a closing brace. */
function block(text, header) {
  const start = text.indexOf(header);
  if (start < 0) return '';
  const end = text.indexOf('\n}', start);
  return text.slice(start, end < 0 ? undefined : end);
}

test('run.mjs has run (work/ exists)', () => {
  assert.ok(workDir(import.meta.url), `There is no work/ folder yet. ${hint}`);
});

test('ordering: migrate depends_on the database', () => {
  const migrate = block(noComments(partFile(import.meta.url, 'ordering/main.tf')), 'resource "terraform_data" "migrate"');
  assert.match(migrate, /depends_on\s*=\s*\[\s*time_sleep\.database_ready\s*\]/, 'FIX 1: in resource "terraform_data" "migrate" add depends_on = [time_sleep.database_ready]. migrate uses no value from the database, so a reference would not do; depends_on is the way to say "after".');
});

test('reads: the data source depends_on the resource that writes the file', () => {
  const data = block(noComments(partFile(import.meta.url, 'reads/main.tf')), 'data "local_file" "settings"');
  assert.match(data, /depends_on\s*=\s*\[\s*local_file\.settings\s*\]/, 'FIX 2: in data "local_file" "settings" add depends_on = [local_file.settings]. Without it Terraform reads the file while planning, before it exists.');
});

test('the last run saw the dependency edge and the right order', () => {
  assert.equal(getFact('c4.p2.migrate_needs_database_edge'), true, `terraform graph shows no edge from migrate to the database. Fix FIX 1, then ${hint}`);
  assert.equal(getFact('c4.p2.edges_respected'), true, `An edge was not respected in the apply order. ${hint}`);
  assert.equal(getFact('c4.p2.migrate_after_database'), true, hint);
  assert.equal(getFact('c4.p2.destroy_reverses_order'), true, hint);
});

test('the last run planned and applied the read without an error', () => {
  assert.equal(getFact('c4.p2.reads_plan_exit_code'), 0, `The plan of reads/ still fails. Fix FIX 2, then ${hint}`);
  assert.equal(getFact('c4.p2.reads_apply_exit_code'), 0, hint);
  assert.equal(getFact('c4.p2.reads_value_read'), true, hint);
});

test('the originals really failed (the proof the fixes matter)', () => {
  // Whether migrate finishes first depends on the machine, so the test checks the structure: no edge from migrate to the database.
  assert.equal(typeof getFact('c4.p2.fault_migrate_before_database'), 'boolean', hint);
  assert.equal(getFact('c4.p2.fault_migrate_needs_database_edge'), false, `The original ordering has no edge from migrate to the database. ${hint}`);
  assert.equal(getFact('c4.p2.reads_fault_plan_exit_code'), 1, hint);
  assert.equal(getFact('c4.p2.cycle_validate_exit_code'), 1, hint);
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(4), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
