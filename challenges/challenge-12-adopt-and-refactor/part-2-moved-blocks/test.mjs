// Challenge 12, part 2 test.
// Run: node --test challenges/challenge-12-adopt-and-refactor/part-2-moved-blocks/test.mjs
// It applies the OLD code (before/main.tf), plans your refactored code and moves.tf against it, applies when the
// plan is safe, and removes everything it built. It fails until the plan says 0 to add and 0 to destroy.
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
  ids = { web: containerId(WEB), cache: containerId(CACHE), webStart: startedAt(WEB), cacheStart: startedAt(CACHE) };
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

test('moves.tf has a moved block for each of the three resources', () => {
  const text = read(join(work, 'moves.tf')).replace(/#.*$/gm, '');
  const blocks = (text.match(/^\s*moved\s*\{/gm) || []).length;
  assert.ok(blocks >= 3, `moves.tf has ${blocks} moved block(s), the refactor renamed 3 resources: docker_network.net, docker_container.web and docker_container.cache. Look for the new names in modules/app/main.tf.`);
});

test('the plan destroys and adds nothing', () => {
  assert.equal(
    planCount.destroy + planCount.add,
    0,
    `The plan would add ${planCount.add} and destroy ${planCount.destroy} object(s). Terraform has no idea that module.app.* are the old objects under new names. A moved block tells it: from = old address, to = new address (include the module.app. prefix).`,
  );
});

test('the plan shows every object as moved', () => {
  const moved = (plan.out.match(/# .* has moved to |# .*\(moved from /g) || []).length;
  assert.equal(moved, 3, `The plan shows ${moved} moved object(s), it should show 3.`);
});

test('apply keeps the containers and the next plan is clean', () => {
  assert.equal(planCount.destroy + planCount.add, 0, 'Fix the plan first (the previous tests).');
  const apply = tfx(['apply', '-auto-approve'], work);
  const a = applied(apply.out);
  assert.ok(a, `apply did not finish:\n${apply.out.slice(0, 1500)}`);
  assert.equal(a.destroyed + a.added, 0, 'the apply added or destroyed something');
  assert.equal(containerId(WEB), ids.web, 'the web container was replaced');
  assert.equal(containerId(CACHE), ids.cache, 'the cache container was replaced');
  assert.equal(startedAt(WEB), ids.webStart, 'the web container was restarted');
  assert.equal(startedAt(CACHE), ids.cacheStart, 'the cache container was restarted');
  assert.ok(isRunning(WEB) && isRunning(CACHE), 'both containers should still run');
  const state = tfx(['state', 'list'], work).out;
  assert.equal((state.match(/^module\.app\./gm) || []).length, 3, `the state should list three module.app.* resources:\n${state}`);
  const again = tfx(['plan'], work);
  assert.match(again.out, /No changes\./, `a second plan should say "No changes.":\n${again.out.slice(0, 1200)}`);
});
