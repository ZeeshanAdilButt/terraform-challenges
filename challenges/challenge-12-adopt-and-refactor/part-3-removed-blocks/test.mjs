// Challenge 12, part 3 test.
// Run: node --test challenges/challenge-12-adopt-and-refactor/part-3-removed-blocks/test.mjs
// It applies the OLD code (before/main.tf: network, web, cache), plans your code (the cache block deleted, plus
// removed.tf), applies when the plan is safe, and removes everything it built. It fails until the cache
// container survives the apply.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { assertDocker, cleanup } from '../../../toolkit/docker.js';
import { prepareWork, partDir } from '../../../toolkit/part.js';
import { N, WEB, CACHE, tfx, counts, applied, containerId, startedAt, isRunning, applyLegacy, read , cleanAll } from '../lib.mjs';

let work;
let plan;
let planCount;
let ids;
let dockerProblem = '';
let legacyProblem = '';

before(() => {
  try {
    assertDocker();
  } catch (e) {
    dockerProblem = e.message;
    return;
  }
  cleanup(N);
  work = prepareWork(import.meta.url);
  const legacy = applyLegacy(partDir(import.meta.url), work);
  if (legacy.code !== 0) {
    legacyProblem = `The old code did not apply:\n${legacy.out.slice(0, 1500)}`;
    return;
  }
  ids = { web: containerId(WEB), cache: containerId(CACHE), cacheStart: startedAt(CACHE) };
  const init = tfx(['init'], work);
  assert.equal(init.code, 0, `terraform init failed:\n${init.out}`);
  plan = tfx(['plan'], work);
  planCount = counts(plan.out);
});

after(() => {
  if (!dockerProblem) cleanAll();
});

test('Docker is running and the old stack was built', () => {
  assert.equal(dockerProblem, '', dockerProblem);
  assert.equal(legacyProblem, '', legacyProblem);
  assert.ok(planCount, `terraform plan printed no "Plan:" line. Output:\n${plan.out.slice(0, 1500)}`);
});

test('removed.tf has a removed block for docker_container.cache', () => {
  const text = read(join(work, 'removed.tf')).replace(/#.*$/gm, '');
  assert.match(text, /removed\s*\{/, 'removed.tf has no removed block yet. Write: removed { from = docker_container.cache ... }');
  assert.match(text, /from\s*=\s*docker_container\.cache\b/, 'The removed block must say from = docker_container.cache (no quotes, no instance key).');
});

test('the plan does not destroy anything', () => {
  assert.equal(
    planCount.destroy,
    0,
    `The plan would destroy ${planCount.destroy} object(s). A removed block destroys by default. Add a lifecycle block inside it and say that the real object stays: lifecycle { destroy = false }.`,
  );
});

test('the plan says the cache container will no longer be managed', () => {
  assert.match(plan.out, /docker_container\.cache will no longer be managed by Terraform, but will not be destroyed/, 'Expected the line "docker_container.cache will no longer be managed by Terraform, but will not be destroyed".');
});

test('apply forgets the cache container and leaves it running', () => {
  assert.equal(planCount.destroy, 0, 'Fix the plan first (the previous tests).');
  const apply = tfx(['apply', '-auto-approve'], work);
  const a = applied(apply.out);
  assert.ok(a, `apply did not finish:\n${apply.out.slice(0, 1500)}`);
  assert.equal(a.destroyed, 0, 'the apply destroyed something');
  assert.ok(isRunning(CACHE), 'the cache container is not running any more');
  assert.equal(containerId(CACHE), ids.cache, 'the cache container was replaced');
  assert.equal(startedAt(CACHE), ids.cacheStart, 'the cache container was restarted');
  assert.equal(containerId(WEB), ids.web, 'the web container was replaced');
  const state = tfx(['state', 'list'], work).out;
  assert.doesNotMatch(state, /docker_container\.cache/, `the state should not list the cache container:\n${state}`);
  assert.match(state, /docker_container\.web/, `the web container should still be in the state:\n${state}`);
  const again = tfx(['plan'], work);
  assert.match(again.out, /No changes\./, `a second plan should say "No changes.":\n${again.out.slice(0, 1200)}`);
});
