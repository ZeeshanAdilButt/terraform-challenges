// Challenge 12, part 1 test.
// Run: node --test challenges/challenge-12-adopt-and-refactor/part-1-import-blocks/test.mjs
// It builds the three objects by hand, plans your imports.tf and containers.tf against them, applies when the
// plan is safe, and removes everything it built. It fails until the plan says 0 to add and 0 to destroy.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { assertDocker, cleanup } from '../../../toolkit/docker.js';
import { prepareWork } from '../../../toolkit/part.js';
import { N, WEB, CACHE, tfx, counts, applied, containerId, startedAt, isRunning, handBuild, writeIds, read , cleanAll } from '../lib.mjs';

let work;
let ids;
let plan;
let planCount;
let dockerProblem = '';

before(() => {
  try {
    assertDocker();
  } catch (e) {
    dockerProblem = e.message;
    return;
  }
  cleanup(N);
  work = prepareWork(import.meta.url);
  ids = handBuild();
  writeIds(work, ids);
  const init = tfx(['init'], work);
  assert.equal(init.code, 0, `terraform init failed:\n${init.out}`);
  plan = tfx(['plan'], work);
  planCount = counts(plan.out);
});

after(() => {
  if (!dockerProblem) cleanAll();
});

test('Docker is running and the plan could be made', () => {
  assert.equal(dockerProblem, '', dockerProblem);
  assert.ok(planCount, `terraform plan printed no "Plan:" line. Output:\n${plan.out.slice(0, 1500)}`);
});

test('imports.tf imports all three objects', () => {
  const text = read(join(work, 'imports.tf')).replace(/#.*$/gm, '');
  const blocks = (text.match(/^\s*import\s*\{/gm) || []).length;
  assert.ok(blocks >= 3, `imports.tf has ${blocks} import block(s) and the stack has 3 objects. Add one for docker_container.web (id = var.web_id) and one for docker_container.cache (id = var.cache_id).`);
});

test('the plan imports all three objects', () => {
  assert.equal(planCount.import, 3, `The plan imports ${planCount.import} object(s), it should import 3 (the network and both containers).`);
});

test('the plan destroys and adds nothing', () => {
  const why = (plan.out.match(/^.*# forces replacement.*$/gm) || []).map((l) => l.trim()).join('\n');
  assert.equal(
    planCount.destroy + planCount.add,
    0,
    `The plan would add ${planCount.add} and destroy ${planCount.destroy} object(s): an object without an import block is planned as new (add), and an imported object that the provider cannot change in place is replaced (destroy and add).\nThe plan names the cause on lines that end with "# forces replacement":\n${why || '(none found)'}\nChange containers.tf so that none of these lines remain.`,
  );
});

test('apply adopts the containers: same ids, same start time, then No changes', () => {
  assert.equal(planCount.destroy + planCount.add, 0, 'Fix the plan first (the previous test).');
  const before = { web: containerId(WEB), cache: containerId(CACHE), webStart: startedAt(WEB), cacheStart: startedAt(CACHE) };
  const apply = tfx(['apply', '-auto-approve'], work);
  const a = applied(apply.out);
  assert.ok(a, `apply did not finish:\n${apply.out.slice(0, 1500)}`);
  assert.equal(a.destroyed, 0, 'the apply destroyed something');
  assert.equal(a.imported, 3, 'the apply should import 3 objects');
  assert.equal(containerId(WEB), before.web, 'the web container was replaced');
  assert.equal(containerId(CACHE), before.cache, 'the cache container was replaced');
  assert.equal(startedAt(WEB), before.webStart, 'the web container was restarted');
  assert.equal(startedAt(CACHE), before.cacheStart, 'the cache container was restarted');
  assert.ok(isRunning(WEB) && isRunning(CACHE), 'both containers should still run');
  const again = tfx(['plan'], work);
  assert.match(again.out, /No changes\./, `a second plan should say "No changes.":\n${again.out.slice(0, 1200)}`);
});
