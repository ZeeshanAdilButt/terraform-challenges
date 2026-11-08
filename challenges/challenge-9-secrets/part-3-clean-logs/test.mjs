// Challenge 9, part 3 test.
// Run: node --test challenges/challenge-9-secrets/part-3-clean-logs/test.mjs
// It loads the scan.mjs that run.mjs copied to work/ (your file, or the reference with --reference), tests it on made-up
// text, runs ci.mjs on small files, and reads the numbers of the last run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-9-secrets/part-3-clean-logs/run.mjs';
const fact = (k) => getFact(`c9.p3.${k}`);

const SECRET = 'fake/api+token=not-a-real-secret';
const work = workDir(import.meta.url);
const scan = work ? await import(pathToFileURL(join(work, 'scan.mjs')).href) : null;

test('run.mjs has been run', () => {
  assert.ok(scan, `There is no work/scan.mjs yet. ${hint}`);
});

test('scan: the plain secret is found, with its line number and no secret in the finding', () => {
  const f = scan.findSecrets(`first line\ntoken=${SECRET}\nthird`, [SECRET]);
  assert.equal(f.length, 1, 'The secret is on line 2 of the text. Expected exactly one finding.');
  assert.equal(f[0].line, 2);
  assert.equal(f[0].form, 'plain');
  assert.ok(!JSON.stringify(f).includes(SECRET), 'A finding must say where, not what: do not put the secret in it.');
});

test('scan: the URL-encoded form is found', () => {
  const f = scan.findSecrets(`GET /deploy?token=${encodeURIComponent(SECRET)}`, [SECRET]);
  assert.deepEqual(f.map((x) => x.form), ['url'], 'encodeURIComponent turns / + = into %2F %2B %3D. CI logs often show a request URL.');
});

test('scan: the base64 form is found', () => {
  const f = scan.findSecrets(`token_b64: ${Buffer.from(SECRET).toString('base64')}`, [SECRET]);
  assert.deepEqual(f.map((x) => x.form), ['base64'], 'Buffer.from(secret).toString("base64") is how many tools encode a value.');
});

test('scan: clean text finds nothing', () => {
  assert.deepEqual(scan.findSecrets('Apply complete! Resources: 1 added, 0 changed, 0 destroyed.', [SECRET]), []);
});

test('scan: an empty secret does not match every line', () => {
  assert.deepEqual(scan.findSecrets('anything at all\nsecond line', ['']), [], 'An empty string is "in" every text. A scanner that is given an empty secret must find nothing.');
});

test('scan: a very short secret is ignored', () => {
  assert.deepEqual(scan.findSecrets('a short value: abc abc abc', ['abc']), [], 'Secrets shorter than 8 characters match everywhere. Ignore them.');
});

test('scan: two secrets are told apart', () => {
  const f = scan.findSecrets(`one=${SECRET}\ntwo=another-fake-secret-value`, [SECRET, 'another-fake-secret-value']);
  assert.deepEqual(f.map((x) => x.secret).sort(), [0, 1]);
});

test('ci.mjs fails the build (exit 1) on a leaky file and passes (exit 0) on a clean one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tfc-c9-'));
  try {
    writeFileSync(join(dir, 'leaky.txt'), `plan output\ninput = "${SECRET}"\n`);
    writeFileSync(join(dir, 'clean.txt'), 'plan output\ninput = "deployed"\n');
    const ci = (file, env = { API_TOKEN: SECRET }) =>
      spawnSync(process.execPath, [join(work, 'ci.mjs'), '--secret-env', 'API_TOKEN', file], { env: { ...process.env, ...env }, encoding: 'utf8' });
    const bad = ci(join(dir, 'leaky.txt'));
    assert.equal(bad.status, 1, `The build must fail when the token is in a file. ${bad.stdout}`);
    assert.ok(!bad.stdout.includes(SECRET), 'ci.mjs must never print the secret.');
    assert.equal(ci(join(dir, 'clean.txt')).status, 0);
    assert.equal(ci(join(dir, 'clean.txt'), { API_TOKEN: '' }).status, 2, 'With no secret to look for, ci.mjs must refuse to pass.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the real build of the leaky stack is failed by the scanner', () => {
  assert.equal(fact('fixture_build_ok'), true, hint);
  assert.ok(fact('fixture_truth_leak_places_count') >= 3, `The leaky stack really leaks into several files. ${hint}`);
  assert.equal(fact('fixture_ci_exit_code'), 1, `The scanner must fail the build on a stack that leaks. ${hint}`);
});

test('your main.tf no longer leaks: the files are clean and the build is green', () => {
  assert.equal(fact('learner_build_ok'), true, hint);
  assert.equal(fact('learner_truth_leak_places_count'), 0, `The token is still in ${fact('learner_truth_leak_places_count')} of plan text, plan JSON, apply text and state. Make the variable ephemeral and hand it to ephemeral.local_command. ${hint}`);
  assert.equal(fact('learner_ci_exit_code'), 0, hint);
});

test('ci.mjs never printed the secret in any form', () => {
  assert.equal(fact('ci_prints_secret'), false, hint);
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});
