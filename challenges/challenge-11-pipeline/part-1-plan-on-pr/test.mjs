// Challenge 11, part 1 test.
// Run: node --test challenges/challenge-11-pipeline/part-1-plan-on-pr/test.mjs
// It loads renderMarkdown from the work folder (the copy run.mjs made of your ci/plan.mjs), reads your workflow
// file and reads the facts that run.mjs saved. It fails until the summary is written and the actions are pinned.
// That is on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getFact } from '../../../toolkit/facts.js';
import { workDir } from '../../../toolkit/part.js';
import { leftovers } from '../../../toolkit/docker.js';

const here = dirname(fileURLToPath(import.meta.url));
const hint = 'Run: node challenges/challenge-11-pipeline/part-1-plan-on-pr/run.mjs';
const work = workDir(import.meta.url);
const change = (address, ...actions) => ({ address, change: { actions } });

async function load() {
  assert.ok(work, `There is no work folder yet. ${hint}`);
  return import(pathToFileURL(join(work, 'ci', 'plan.mjs')).href);
}

test('run.mjs has been run', () => {
  assert.ok(work, `There is no work folder yet. ${hint}`);
  assert.notEqual(getFact('c11.p1.first_plan_add_count'), undefined, `No facts yet. ${hint}`);
});

test('renderMarkdown: a plan that only creates', async () => {
  const { renderMarkdown } = await load();
  const out = renderMarkdown({ resource_changes: [change('docker_volume.data', 'create'), change('docker_image.alpine', 'create')] }, { dir: 'infra' });
  assert.match(out, /^## Terraform plan for `infra`$/m, 'Start with the heading: ## Terraform plan for `<dir>`');
  assert.match(out, /^\*\*Plan: 2 to add, 0 to change, 0 to destroy\.\*\*$/m, 'Write the bold summary line, for example **Plan: 2 to add, 0 to change, 0 to destroy.**');
  assert.match(out, /^\| Resource \| Action \|$/m, 'Write the table header: | Resource | Action |');
  assert.match(out, /^\| `docker_volume\.data` \| create \|$/m, 'One row per change: | `address` | action |');
  assert.doesNotMatch(out, /Warning/, 'No destroys, so no warning.');
});

test('renderMarkdown: a replace counts as an add and a destroy, and raises the warning', async () => {
  const { renderMarkdown } = await load();
  const out = renderMarkdown({ resource_changes: [change('docker_container.db', 'delete', 'create'), change('docker_volume.data', 'no-op')] }, { dir: 'infra' });
  assert.match(out, /\*\*Plan: 1 to add, 0 to change, 1 to destroy\.\*\*/, 'A replace is one add and one destroy.');
  assert.match(out, /^\| `docker_container\.db` \| replace \|$/m);
  assert.doesNotMatch(out, /docker_volume\.data/, 'A no-op change is not listed.');
  const last = out.trim().split('\n').pop();
  assert.match(last, /^> \*\*Warning:\*\* .*1 resource\b/, 'The last line must start with > **Warning:** and say how many resources are destroyed.');
});

test('renderMarkdown: create-before-destroy order is still a replace; updates and deletes', async () => {
  const { renderMarkdown } = await load();
  const out = renderMarkdown({ resource_changes: [change('a.x', 'create', 'delete'), change('a.y', 'update'), change('a.z', 'delete')] }, { dir: 'infra' });
  assert.match(out, /\*\*Plan: 1 to add, 1 to change, 2 to destroy\.\*\*/);
  assert.match(out, /^\| `a\.x` \| replace \|$/m);
  assert.match(out, /^\| `a\.y` \| update \|$/m);
  assert.match(out, /^\| `a\.z` \| delete \|$/m);
  assert.match(out.trim().split('\n').pop(), /destroys 2 resources/);
});

test('renderMarkdown: nothing to do', async () => {
  const { renderMarkdown } = await load();
  const out = renderMarkdown({ resource_changes: [change('a.x', 'no-op'), change('data.a.y', 'read')] }, { dir: 'infra' });
  assert.match(out, /^\*\*No changes\.\*\*$/m);
  assert.doesNotMatch(out, /\| Resource \|/, 'No table when nothing changes.');
  assert.deepEqual(renderMarkdown({}, { dir: 'infra' }).includes('**No changes.**'), true, 'A plan with no resource_changes at all is also "No changes."');
});

test('the Markdown of the real runs agrees with what Terraform printed', () => {
  assert.equal(getFact('c11.p1.first_run_exit_code'), 0, `The pipeline failed on the first run. ${hint}`);
  assert.equal(getFact('c11.p1.first_run_steps_ok_count'), 5);
  assert.equal(getFact('c11.p1.md_headline_matches_terraform'), true, 'The summary line must show the same counts as terraform show prints.');
  assert.equal(getFact('c11.p1.no_changes_md'), true);
  assert.equal(getFact('c11.p1.replace_destroy_count'), 1);
  assert.equal(getFact('c11.p1.replace_warning_present'), true);
  assert.equal(getFact('c11.p1.volume_replace_destroy_count'), 2);
});

test('formatting and validation failures stop the pipeline early', () => {
  assert.equal(getFact('c11.p1.fmt_failure_exit_code'), 1);
  assert.equal(getFact('c11.p1.fmt_failure_stopped_at_fmt'), true);
  assert.equal(getFact('c11.p1.fmt_failure_in_comment'), true);
  assert.equal(getFact('c11.p1.validate_failure_exit_code'), 1);
  assert.equal(getFact('c11.p1.validate_failure_stopped_before_fmt'), true);
});

test('every action in the workflow is pinned to a full commit SHA', () => {
  const file = work && join(work, '.github', 'workflows', 'plan.yml');
  assert.ok(file && existsSync(file), 'Missing .github/workflows/plan.yml');
  const uses = readFileSync(file, 'utf8').split('\n').map((l) => /^\s*-?\s*uses:\s*(\S+)/.exec(l)).filter(Boolean).map((m) => m[1]);
  assert.ok(uses.length >= 3, 'The workflow should use checkout, setup-node and setup-terraform.');
  const loose = uses.filter((u) => !/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(u));
  assert.deepEqual(loose, [], `These are not pinned to 40 hex characters: ${loose.join(', ')}. Look each SHA up: gh api repos/<owner>/<repo>/commits/<tag> -q .sha`);
});

test('the workflow plans and never applies, with least privilege', () => {
  const text = work ? readFileSync(join(work, '.github', 'workflows', 'plan.yml'), 'utf8') : '';
  assert.match(text, /^permissions:/m, 'Set permissions: for the workflow.');
  assert.doesNotMatch(text, /pull_request_target/, 'pull_request_target gives untrusted code a write token. Use pull_request.');
  assert.doesNotMatch(text, /terraform apply/, 'This workflow only plans.');
  assert.match(text, /ci\/plan\.mjs/);
});

test('nothing with the challenge label is left in Docker', () => {
  assert.deepEqual(leftovers(11), { containers: 0, networks: 0, volumes: 0 });
});

test('the README links the safety rules', () => {
  assert.match(readFileSync(join(here, 'README.md'), 'utf8'), /\(\.\.\/\.\.\/\.\.\/SAFETY\.md\)/);
});

test('results.md exists', () => {
  assert.ok(existsSync(join(here, 'results.md')), 'Run run.mjs with --record to write results.md');
});
