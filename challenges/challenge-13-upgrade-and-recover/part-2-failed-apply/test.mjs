// Challenge 13, part 2 test.
// Run: node --test challenges/challenge-13-upgrade-and-recover/part-2-failed-apply/test.mjs
// It applies the ORIGINAL main.tf (faults/main.tf), which fails halfway, then plans and applies YOUR main.tf on top
// of the partial state, and checks that every container runs and the healthy one was not touched. It removes
// everything it built.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { assertDocker, cleanup } from '../../../toolkit/docker.js';
import { prepareWork, partDir } from '../../../toolkit/part.js';
import { N, run, tfx, counts, applied, errorBlock, cleanAll } from '../lib.mjs';

const NAMES = ['tfc-c13-first', 'tfc-c13-second', 'tfc-c13-third'];
const idOf = (n) => run(['inspect', '--format', '{{.Id}}', n]).stdout.trim();
const status = (n) => run(['inspect', '--format', '{{.State.Status}}', n]).stdout.trim() || 'missing';
const D = { docker: true };

let broken;
let bad;
let plan;
let planCount;
let apply;
let firstBefore;
let dockerProblem = '';

before(() => {
  try {
    assertDocker();
  } catch (e) {
    dockerProblem = e.message;
    return;
  }
  cleanup(N);
  const work = prepareWork(import.meta.url);
  broken = join(work, 'broken');
  mkdirSync(broken, { recursive: true });
  copyFileSync(join(partDir(import.meta.url), 'faults', 'main.tf'), join(broken, 'main.tf'));
  tfx(['init'], broken, D);
  bad = tfx(['apply', '-auto-approve'], broken, D);
  firstBefore = idOf('tfc-c13-first');
  copyFileSync(join(work, 'main.tf'), join(broken, 'main.tf'));
  plan = tfx(['plan'], broken, D);
  planCount = counts(plan.out);
  apply = tfx(['apply', '-auto-approve'], broken, D);
});

after(() => {
  if (!dockerProblem) cleanAll();
});

test('Docker is running and the original main.tf fails halfway, as it should', () => {
  assert.equal(dockerProblem, '', dockerProblem);
  assert.notEqual(bad.code, 0, 'The original main.tf was expected to fail on a port clash, and it did not. Do not edit faults/main.tf.');
  assert.match(bad.out, /port is already allocated/, `The original failed for another reason:\n${errorBlock(bad.out, 6)}`);
});

test('the plan on the partial state replaces the half-built container and builds the missing one', () => {
  assert.ok(planCount, `terraform plan printed no "Plan:" line:\n${plan.out.slice(0, 1200)}`);
  assert.match(plan.out, /docker_container\.second is tainted, so must be replaced/, `Expected "docker_container.second is tainted, so must be replaced" in the plan.\n${plan.out.slice(0, 1200)}`);
  assert.equal(planCount.add, 2, `The plan should add 2 (second again, third) and has ${planCount.add}.`);
  assert.equal(planCount.destroy, 1, `The plan should destroy 1 (the tainted second) and has ${planCount.destroy}. "first" must not be replaced.`);
});

test('your main.tf recovers the apply', () => {
  const a = applied(apply.out);
  assert.ok(a, `The apply on your main.tf failed:\n${errorBlock(apply.out, 8) || apply.out.slice(0, 1200)}\nTwo containers cannot publish the same host port. Change the host port of "second" (8842 is free).`);
  assert.equal(a.added, 2);
  assert.equal(a.destroyed, 1);
});

test('all three containers run and "first" was never touched', () => {
  for (const n of NAMES) assert.equal(status(n), 'running', `${n} is ${status(n)}`);
  assert.equal(idOf('tfc-c13-first'), firstBefore, '"first" was replaced. A recovery must leave the healthy resources alone.');
});

test('a second plan is empty', () => {
  const again = tfx(['plan'], broken, D);
  assert.match(again.out, /No changes\./, `A second plan should say "No changes.":\n${again.out.slice(0, 1200)}`);
});
