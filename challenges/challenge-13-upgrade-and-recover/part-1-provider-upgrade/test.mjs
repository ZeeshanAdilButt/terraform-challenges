// Challenge 13, part 1 test.
// Run: node --test challenges/challenge-13-upgrade-and-recover/part-1-provider-upgrade/test.mjs
// It applies the OLD code on the OLD provider versions (before/), runs terraform init -upgrade with your
// versions.tf, and checks the constraints, the lock file, the warnings and the plan. No Docker objects are made.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { prepareWork, partDir } from '../../../toolkit/part.js';
import { tfx, counts, validateJson, lockInfo, applyLegacy, read } from '../lib.mjs';

let work;
let legacy;
let up;
let val;
let plan;

before(() => {
  work = prepareWork(import.meta.url);
  legacy = applyLegacy(partDir(import.meta.url), work);
  if (legacy.code !== 0) return;
  up = tfx(['init', '-upgrade'], work);
  val = validateJson(work);
  plan = tfx(['plan'], work);
});

const versionAtLeast = (v, min) => {
  const a = String(v).split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
};

test('the old stack was built and init -upgrade ran', () => {
  assert.equal(legacy.code, 0, `The old code did not apply:\n${legacy.out.slice(0, 1500)}`);
  assert.equal(up.code, 0, `terraform init -upgrade failed:\n${up.out.slice(0, 1500)}`);
});

test('versions.tf pins both providers to a range with ~>', () => {
  const text = read(join(work, 'versions.tf')).replace(/#.*$/gm, '');
  const versions = [...text.matchAll(/version\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(versions.length, 2, `versions.tf should set a version for random and for local, found ${versions.length}.`);
  for (const v of versions) {
    assert.match(v, /^~>\s*\d/, `The constraint "${v}" is not a "~>" range. ">=" lets the next init -upgrade take any newer release, including a new major version. Use "~> 3.9" for random and "~> 2.9" for local.`);
  }
});

test('the lock file now records the upgraded versions', () => {
  const lock = read(join(work, '.terraform.lock.hcl'));
  const random = lockInfo(lock, 'registry.terraform.io/hashicorp/random');
  const local = lockInfo(lock, 'registry.terraform.io/hashicorp/local');
  assert.ok(versionAtLeast(random?.version, '3.9.0'), `random is locked at ${random?.version}. After init -upgrade with "~> 3.9" it should be 3.9.x.`);
  assert.ok(versionAtLeast(local?.version, '2.9.0'), `local is locked at ${local?.version}. After init -upgrade with "~> 2.9" it should be 2.9.x.`);
});

test('terraform validate has no warnings', () => {
  assert.equal(val.errors, 0, `validate reports errors: ${val.summaries.join('; ')}`);
  assert.equal(val.warnings, 0, `The upgraded provider warns about ${val.warnings} thing(s): ${val.summaries.join('; ')}. In main.tf replace the deprecated argument "number" with "numeric".`);
});

test('the plan after the upgrade is empty', () => {
  const c = counts(plan.out);
  assert.ok(c, `terraform plan printed no result. Output:\n${plan.out.slice(0, 1500)}`);
  assert.equal(c.add + c.change + c.destroy, 0, `The plan is not empty: ${c.add} to add, ${c.change} to change, ${c.destroy} to destroy.\n${plan.out.slice(0, 1500)}`);
});
