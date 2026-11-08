// Challenge 6, part 1 test.
// Run: node --test challenges/challenge-6-plans-and-drift/part-1-read-the-plan-json/test.mjs
// It runs classify.mjs on a few hand-made changes and on the changes of the recorded plan (fixtures/changes.json),
// then checks the facts the last run.mjs saved. It fails until classify.mjs is fixed. That is on purpose.
// To test the reference solution instead: set TFC_REFERENCE=1 for both run.mjs and this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { leftovers } from '../../../toolkit/docker.js';
import { useReference, workDir } from '../../../toolkit/part.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-6-plans-and-drift/part-1-read-the-plan-json/run.mjs';
const file = useReference() ? join(here, 'reference', 'classify.mjs') : join(here, 'classify.mjs');
const { classify, replaceReasons } = await import(pathToFileURL(file).href);
const changes = JSON.parse(readFileSync(join(here, 'fixtures', 'changes.json'), 'utf8'));
const TRUTH = {
  'docker_container.web': 'replace',
  'docker_container.worker': 'update',
  'local_file.motd': 'replace',
  'terraform_data.old': 'delete',
  'terraform_data.newcomer': 'create',
  'terraform_data.same': 'none',
  'terraform_data.cbd': 'replace',
};

test('run.mjs has run (work/ exists)', () => {
  assert.ok(workDir(import.meta.url), `There is no work/ folder yet. ${hint}`);
});

test('classify: single actions', () => {
  assert.equal(classify({ actions: ['create'] }), 'create');
  assert.equal(classify({ actions: ['update'] }), 'update');
  assert.equal(classify({ actions: ['delete'] }), 'delete');
  assert.equal(classify({ actions: ['no-op'] }), 'none');
  assert.equal(classify({ actions: ['read'] }), 'read');
});

test('classify: delete then create is a replacement', () => {
  assert.equal(classify({ actions: ['delete', 'create'] }), 'replace', 'FIX 1: ["delete","create"] destroys the old resource and builds a new one. Report it as replace, not as delete or create.');
});

test('classify: create then delete (create_before_destroy) is a replacement too', () => {
  assert.equal(classify({ actions: ['create', 'delete'] }), 'replace', 'FIX 1: ["create","delete"] is also a replacement, in the other order. Check for both actions, in any order.');
});

for (const c of changes) {
  test(`recorded plan: ${c.address} is a ${TRUTH[c.address]}`, () => {
    assert.equal(classify({ actions: c.actions, replace_paths: c.replace_paths, action_reason: c.action_reason }), TRUTH[c.address], `actions were ${JSON.stringify(c.actions)}`);
  });
}

test('replaceReasons: a replacement names the attribute that forced it', () => {
  assert.deepEqual(replaceReasons({ actions: ['delete', 'create'], replace_paths: [['image'], ['labels', 0, 'value']] }), ['image', 'labels.0.value'], 'FIX 2: join every path of change.replace_paths with ".".');
  assert.deepEqual(replaceReasons({ actions: ['update'] }), [], 'No replace_paths: return an empty list.');
  const web = changes.find((c) => c.address === 'docker_container.web');
  assert.ok(web.replace_paths.length > 0, 'the fixture has no replace_paths for web');
  assert.deepEqual(replaceReasons({ actions: web.actions, replace_paths: web.replace_paths }), web.replace_paths.map((p) => p.join('.')));
});

test('the last run: your classifier agreed with the truth for every resource', () => {
  assert.equal(getFact('c6.p1.classify_correct_count'), getFact('c6.p1.resources_in_plan_count'), `Some resources were classified wrongly in the last run. ${hint}`);
  assert.equal(getFact('c6.p1.reasons_correct_count'), getFact('c6.p1.resources_in_plan_count'), `Some replace reasons were wrong in the last run. ${hint}`);
});

test('the last run: the plan text counts hide the replacements', () => {
  assert.equal(getFact('c6.p1.truth_replace_count'), 3, hint);
  assert.equal(getFact('c6.p1.plan_text_destroy_count'), 4, hint);
  assert.equal(getFact('c6.p1.requested_replace_reason'), 'replace_by_request', hint);
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(6), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md and chart.svg exist', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
  assert.match(readFileSync(join(here, 'chart.svg'), 'utf8'), /role="img"/);
});
