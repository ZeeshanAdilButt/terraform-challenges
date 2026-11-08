// Challenge 4, part 1 test.
// Run: node --test challenges/challenge-4-lock-file-and-graph/part-1-the-lock-file/test.mjs
// It reads your files (main.tf, team.gitignore, platforms.txt) and the facts the last run.mjs saved.
// It fails until you have made the three fixes and run run.mjs. That is on purpose.
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
const hint = 'Run: node challenges/challenge-4-lock-file-and-graph/part-1-the-lock-file/run.mjs';

test('run.mjs has run (work/ exists)', () => {
  assert.ok(workDir(import.meta.url), `There is no work/ folder yet. ${hint}`);
});

test('main.tf constrains the provider version with ~>', () => {
  const tf = partFile(import.meta.url, 'main.tf').replace(/^\s*#.*$/gm, '');
  assert.match(tf, /version\s*=\s*"~>\s*\d+\.\d+/, 'FIX 1: add version = "~> 2.9" inside required_providers.local. A pessimistic constraint (~>) allows patch and minor updates of 2.x but not 3.0.');
});

test('team.gitignore does not hide the lock file', () => {
  const lines = partFile(import.meta.url, 'team.gitignore').split('\n').map((l) => l.trim());
  assert.ok(!lines.includes('.terraform.lock.hcl'), 'FIX 2: remove the line .terraform.lock.hcl from team.gitignore. The lock file must be committed, so Git must be able to see it.');
});

test('platforms.txt names the three platforms of the team', () => {
  const list = partFile(import.meta.url, 'platforms.txt').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const p of ['linux_amd64', 'darwin_arm64', 'windows_amd64']) {
    assert.ok(list.includes(p), `FIX 3: platforms.txt must list ${p}. Today it lists: ${list.join(', ') || 'nothing'}.`);
  }
});

test('the last run wrote a lock file with a constraint and one checksum per platform', () => {
  assert.notEqual(getFact('c4.p1.lock_constraint'), 'none', `The lock file has no constraints line, because main.tf set no constraint. Fix main.tf, then ${hint}`);
  assert.ok(getFact('c4.p1.lock_h1_hash_after_providers_lock_count') >= 3, `The lock file must hold at least 3 h1 checksums after providers lock. Fix platforms.txt, then ${hint}`);
  assert.equal(getFact('c4.p1.lock_h1_hash_after_providers_lock_count'), getFact('c4.p1.platforms_count'), `One h1 checksum per platform expected. ${hint}`);
});

test('the older lock file made init stop, and init -upgrade moved the version', () => {
  assert.equal(getFact('c4.p1.init_refused_old_lock'), true, `With your constraint, init should refuse the older locked version. ${hint}`);
  assert.equal(getFact('c4.p1.upgrade_moved_version'), true, hint);
  assert.match(String(getFact('c4.p1.refusal_line')), /must use terraform init -upgrade/, hint);
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
