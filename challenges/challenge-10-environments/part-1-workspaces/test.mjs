// Challenge 10, part 1 test.
// Run: node --test challenges/challenge-10-environments/part-1-workspaces/test.mjs
// It reads the work folder and the facts that run.mjs saved. It fails until both faults in main.tf are fixed.
// That is on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';
import { leftovers } from '../../../toolkit/docker.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-10-environments/part-1-workspaces/run.mjs';
const work = workDir(import.meta.url);
const main = () => (work && existsSync(join(work, 'main.tf')) ? readFileSync(join(work, 'main.tf'), 'utf8') : '');

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work folder yet. ${hint}`);
  assert.notEqual(getFact('c10.p1.workspaces_count'), undefined, `No facts yet. ${hint}`);
});

test('the container name carries the workspace', () => {
  const name = (/resource "docker_container" "app" \{[^}]*?name\s*=\s*"([^"]*)"/s.exec(main()) || [])[1] || '';
  assert.match(name, /\$\{terraform\.workspace\}/, `The container name is "${name}". Two workspaces would fight over one name. Put \${terraform.workspace} in it.`);
});

test('the default workspace is refused', () => {
  assert.match(main(), /precondition/, 'Add a precondition inside the container (in a lifecycle block) that allows only the workspaces dev and prod.');
  assert.match(main(), /terraform\.workspace/, 'The precondition must look at terraform.workspace.');
});

test('dev and prod both applied, with two state files and two containers', () => {
  assert.equal(getFact('c10.p1.apply_prod_ok'), true, `The apply in the prod workspace failed. Read the error in the run output. ${hint}`);
  assert.equal(getFact('c10.p1.containers_count'), 2, 'There must be one container per workspace.');
  assert.equal(getFact('c10.p1.state_files_count'), 2, 'Local state keeps one state file per workspace.');
});

test('the wrong-workspace change hit prod and not dev', () => {
  assert.equal(getFact('c10.p1.wrong_env_destroy_count'), 1, 'The plan in the prod workspace must show exactly one destroy (the prod container).');
  assert.equal(getFact('c10.p1.prod_changed'), true);
  assert.equal(getFact('c10.p1.dev_unchanged'), true);
});

test('the default workspace is blocked by the precondition', () => {
  assert.equal(getFact('c10.p1.default_blocked'), true, 'A plan in the default workspace must fail with "Resource precondition failed".');
});

test('a workspace that still has objects cannot be deleted', () => {
  assert.equal(getFact('c10.p1.delete_nonempty_blocked'), true);
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
