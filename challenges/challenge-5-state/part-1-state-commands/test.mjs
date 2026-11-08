// Challenge 5, part 1 test.
// Run: node --test challenges/challenge-5-state/part-1-state-commands/test.mjs
// It reads your commands.txt and the facts the last run.mjs saved.
// It fails until your commands make the plan say "No changes" and keep out/legacy.txt. That is on purpose.
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
const hint = 'Run: node challenges/challenge-5-state/part-1-state-commands/run.mjs';
const commands = () => partFile(import.meta.url, 'commands.txt').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

test('run.mjs has run (work/ exists)', () => {
  assert.ok(workDir(import.meta.url), `There is no work/ folder yet. ${hint}`);
});

test('commands.txt renames local_file.notes to local_file.readme with state mv', () => {
  assert.ok(
    commands().some((c) => /^state mv (-\S+ )*local_file\.notes local_file\.readme$/.test(c)),
    'FIX 1: the code calls the resource local_file.readme, the state calls it local_file.notes. Add the line: state mv local_file.notes local_file.readme',
  );
});

test('commands.txt makes Terraform forget local_file.legacy with state rm', () => {
  assert.ok(
    commands().some((c) => /^state rm (-\S+ )*local_file\.legacy$/.test(c)),
    'FIX 2: legacy is gone from the code but its file must stay on disk. Add the line: state rm local_file.legacy (rm forgets; it does not delete the file).',
  );
});

test('the last run: the plan wanted to destroy two things before your commands', () => {
  assert.equal(getFact('c5.p1.plan_before_destroy_count'), 2, hint);
  assert.equal(getFact('c5.p1.plan_before_add_count'), 1, hint);
});

test('the last run: every command worked', () => {
  assert.ok(getFact('c5.p1.commands_run_count') >= 2, `Your commands did not run (or fewer than 2 did). ${hint}`);
  assert.equal(getFact('c5.p1.commands_failed_count'), 0, `A command failed or was skipped. Read the step "your commands" in the output of run.mjs. ${hint}`);
});

test('the last run: the plan after your commands says No changes', () => {
  assert.equal(getFact('c5.p1.plan_after_no_changes'), true, `The plan after your commands still wants changes (to add: ${getFact('c5.p1.plan_after_add_count')}, to destroy: ${getFact('c5.p1.plan_after_destroy_count')}). ${hint}`);
});

test('the last run: legacy.txt is still on disk and Terraform manages two resources', () => {
  assert.equal(getFact('c5.p1.legacy_file_kept'), true, hint);
  assert.equal(getFact('c5.p1.state_resources_after_count'), 2, hint);
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
