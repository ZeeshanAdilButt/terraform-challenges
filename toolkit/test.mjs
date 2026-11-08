// Unit tests for the toolkit itself. No Docker, no Terraform needed.
// Run: node --test toolkit/test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { planCounts, applyCounts, PIN, toolName } from './tf.js';
import { prepareWork, partDir, useReference, workDir } from './part.js';
import { setFact, getFact } from './facts.js';
import { name, label } from './docker.js';
import { median, round } from './stats.js';
import { barsSvg } from './bars.js';
import { Recorder } from './record.js';

const scratch = mkdtempSync(join(tmpdir(), 'tfc-toolkit-'));
test.after(() => rmSync(scratch, { recursive: true, force: true }));

test('planCounts reads the Plan line', () => {
  assert.deepEqual(planCounts('...\nPlan: 4 to add, 1 to change, 2 to destroy.\n'), { add: 4, change: 1, destroy: 2 });
  assert.deepEqual(planCounts('Plan: 0 to add, 0 to change, 0 to destroy.'), { add: 0, change: 0, destroy: 0 });
});

test('planCounts returns null when there is no Plan line', () => {
  assert.equal(planCounts('No changes. Your infrastructure matches the configuration.'), null);
  assert.equal(planCounts(''), null);
});

test('applyCounts reads the Apply complete line', () => {
  assert.deepEqual(applyCounts('Apply complete! Resources: 3 added, 0 changed, 1 destroyed.'), { added: 3, changed: 0, destroyed: 1 });
  assert.equal(applyCounts('Error: something broke'), null);
});

test('the pins name the versions the reference runs used', () => {
  assert.equal(PIN.terraform.version, '1.17.1');
  assert.equal(PIN.tofu.version, '1.13.9');
  assert.ok(['terraform', 'tofu'].includes(toolName()));
});

test('part.js: prepareWork copies starter files and leaves out README, run.mjs, test.mjs and reference', () => {
  const dir = join(scratch, 'part-a');
  mkdirSync(join(dir, 'reference'), { recursive: true });
  for (const f of ['main.tf', 'README.md', 'run.mjs', 'test.mjs', 'results.md']) writeFileSync(join(dir, f), f);
  writeFileSync(join(dir, 'reference', 'main.tf'), 'solution');
  const meta = pathToFileURL(join(dir, 'run.mjs')).href;
  assert.equal(partDir(meta), dir);
  const old = process.env.TFC_REFERENCE;
  delete process.env.TFC_REFERENCE;
  try {
    const work = prepareWork(meta);
    assert.equal(work, join(dir, 'work'));
    assert.equal(readFileSync(join(work, 'main.tf'), 'utf8'), 'main.tf');
    for (const f of ['README.md', 'run.mjs', 'test.mjs', 'results.md', 'reference']) assert.equal(existsSync(join(work, f)), false, `${f} must not be copied`);
    assert.equal(workDir(meta), work);
  } finally {
    if (old !== undefined) process.env.TFC_REFERENCE = old;
  }
});

test('part.js: TFC_REFERENCE=1 overlays the reference files, and a second call starts fresh', () => {
  const dir = join(scratch, 'part-b');
  mkdirSync(join(dir, 'reference'), { recursive: true });
  writeFileSync(join(dir, 'main.tf'), 'starter');
  writeFileSync(join(dir, 'reference', 'main.tf'), 'solution');
  const meta = pathToFileURL(join(dir, 'run.mjs')).href;
  const old = process.env.TFC_REFERENCE;
  try {
    process.env.TFC_REFERENCE = '1';
    assert.equal(useReference(), true);
    const work = prepareWork(meta);
    assert.equal(readFileSync(join(work, 'main.tf'), 'utf8'), 'solution');
    writeFileSync(join(work, 'left-over.txt'), 'x');
    process.env.TFC_REFERENCE = '0';
    assert.equal(useReference(), false);
    prepareWork(meta);
    assert.equal(readFileSync(join(work, 'main.tf'), 'utf8'), 'starter');
    assert.equal(existsSync(join(work, 'left-over.txt')), false, 'work/ must be recreated, not reused');
  } finally {
    if (old === undefined) delete process.env.TFC_REFERENCE;
    else process.env.TFC_REFERENCE = old;
  }
});

test('facts.js: names must look like c<N>.p<M>.<what>_<unit>', () => {
  const old = process.env.TFC_FACTS_PATH;
  process.env.TFC_FACTS_PATH = join(scratch, 'facts.json');
  try {
    setFact('c1.p2.plan_add_count', 3);
    setFact('c1.p2.runner_mode', 'docker');
    setFact('c1.p2.second_plan_clean', true);
    assert.equal(getFact('c1.p2.plan_add_count'), 3);
    assert.equal(getFact('c1.p2.runner_mode'), 'docker');
    assert.equal(getFact('c1.p2.second_plan_clean'), true);
    assert.equal(getFact('c9.p9.never_written_count'), undefined);
    for (const bad of ['plan_add_count', 'c1.plan_add_count', 'C1.p2.plan_add_count', 'c1.p2.Plan-Add', 'c1.p2.']) {
      assert.throws(() => setFact(bad, 1), /Bad fact name/, bad);
    }
    assert.throws(() => setFact('c1.p2.x_count', NaN), /needs a number/);
    assert.throws(() => setFact('c1.p2.x_count', { a: 1 }), /needs a number/);
    const keys = Object.keys(JSON.parse(readFileSync(process.env.TFC_FACTS_PATH, 'utf8')));
    assert.deepEqual(keys, [...keys].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), 'facts.json keys are sorted');
  } finally {
    if (old === undefined) delete process.env.TFC_FACTS_PATH;
    else process.env.TFC_FACTS_PATH = old;
  }
});

test('docker.js: names and labels carry the challenge number', () => {
  assert.equal(name(3, 'web'), 'tfc-c3-web');
  assert.deepEqual(label(3), ['--label', 'tfc.challenge=3']);
  assert.throws(() => name(-1, 'x'), /whole number/);
  assert.throws(() => label('3'), /whole number/);
});

test('stats.js and bars.js: median, round and a chart that names every bar', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(round(1.2345, 2), 1.23);
  const svg = barsSvg({ title: 'Destroys', unit: 'resources', bars: [{ label: 'count', value: 3 }, { label: 'for_each', value: 1 }] });
  assert.match(svg, /<title id="t">Destroys<\/title>/);
  assert.match(svg, /count: 3 resources\. for_each: 1 resources/);
  assert.throws(() => barsSvg({ title: 'x', bars: [] }), /at least one bar/);
});

test('record.js: a recorded step appears in results.md with command, output and note', () => {
  const rec = new Recorder('Test part');
  const log = console.log;
  console.log = () => {};
  try {
    rec.step('terraform plan', 'Plan: 1 to add, 0 to change, 0 to destroy.\r\n', 'One resource.');
  } finally {
    console.log = log;
  }
  const md = rec.markdown('test machine');
  assert.match(md, /# Results: Test part/);
  assert.match(md, /```sh\nterraform plan\n```/);
  assert.match(md, /```text\nPlan: 1 to add, 0 to change, 0 to destroy\.\n```/);
  assert.match(md, /\*\*Note:\*\* One resource\./);
});
