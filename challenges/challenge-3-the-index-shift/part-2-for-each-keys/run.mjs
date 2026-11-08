// Challenge 3, part 2: for_each keys.
// Run: node challenges/challenge-3-the-index-shift/part-2-for-each-keys/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
//
// It applies five files made with for_each (and three more from a map of objects), plans the same edits as
// part 1 (never applied, except one), plans edits to the map, and finally shows the error you get when
// for_each keys are only known after apply. Only the local and random providers are used.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { barsSvg } from '../../../toolkit/bars.js';
import { setFact, getFact } from '../../../toolkit/facts.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { Recorder } from '../../../toolkit/record.js';
import { applyCounts, mode, planCounts } from '../../../toolkit/tf.js';
import { errorBlock, planLines, tfx, touched } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 3, part 2: for_each keys');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });
const opts = { cwd: work };

const BASE = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
const SCENARIOS = [
  { key: 'remove_first', label: 'remove the first', what: 'remove "alpha", the first name', names: ['bravo', 'charlie', 'delta', 'echo'] },
  { key: 'remove_middle', label: 'remove the middle', what: 'remove "charlie", the middle name', names: ['alpha', 'bravo', 'delta', 'echo'] },
  { key: 'remove_last', label: 'remove the last', what: 'remove "echo", the last name', names: ['alpha', 'bravo', 'charlie', 'delta'] },
  { key: 'reverse', label: 'reverse the order', what: 'reverse the order of the five names', names: [...BASE].reverse() },
  { key: 'insert_front', label: 'insert at the front', what: 'insert "zulu" in front of the five names', names: ['zulu', ...BASE] },
];
const SITES = {
  web: { port: 80, greeting: 'hello web' },
  api: { port: 8080, greeting: 'hello api' },
  docs: { port: 8081, greeting: 'hello docs' },
};
const SITE_EDITS = [
  { key: 'site_edit', what: 'change the port of "api" from 8080 to 9090', sites: { ...SITES, api: { ...SITES.api, port: 9090 } } },
  { key: 'site_remove', what: 'remove the site "web"', sites: { api: SITES.api, docs: SITES.docs } },
  { key: 'site_add', what: 'add a site "blog"', sites: { ...SITES, blog: { port: 8082, greeting: 'hello blog' } } },
];
const varArg = (name, value) => ['-var', `${name}=${JSON.stringify(value)}`];
/** Counts of a plan: "No changes" counts as 0, 0, 0; null when the plan failed. */
const counts = (out) => planCounts(out) ?? (/^No changes/m.test(out) ? { add: 0, change: 0, destroy: 0 } : null);
const NOTES = {
  remove_first: 'The names are the addresses, so "alpha" has its own address and nothing else moves. One destroy.',
  remove_middle: 'Only local_file.item["charlie"] goes. Everything else keeps its address, so nothing is replaced. This is the edit that cost three destroys with count.',
  remove_last: 'One destroy, as with count.',
  reverse: 'Order does not matter to a set. The plan says No changes. With count the same edit replaced four files.',
  insert_front: 'One new address, one add, nothing else touched.',
};

try {
  const init = tfx(['init'], opts);
  if (init.code !== 0) throw new Error(`terraform init failed:\n${init.out}`);

  // Step 1: the plan with your main.tf.
  const first = tfx(['plan'], opts);
  const firstOk = first.code === 0 && counts(first.out) !== null;
  if (!firstOk) {
    rec.step('terraform plan   (your main.tf)', errorBlock(first.out, 14), 'for_each does not accept a list. A set of strings or a map has a key for every element; a list has only positions. Turn the list into a set with toset().');
    setFact('c3.p2.baseline_plan_ok', false);
    throw new Error('Your main.tf did not plan. Fix the error above (toset), then run again.');
  }

  // Step 2: the baseline apply.
  const apply0 = tfx(['apply', '-auto-approve'], opts);
  const a0 = applyCounts(apply0.out);
  if (!a0) throw new Error(`The baseline apply failed:\n${apply0.out}`);
  rec.step(
    'terraform apply -auto-approve   (five names and three sites)',
    `${apply0.out.split('\n').filter((l) => /Apply complete/.test(l)).join('\n')}\nout/:   ${readdirSync(join(work, 'out')).sort().join(' ')}\nsites/: ${readdirSync(join(work, 'sites')).sort().join(' ')}`,
    'Eight resources. Their addresses are now local_file.item["alpha"], local_file.item["bravo"] ... and local_file.site["web"], ... The key is the address.',
  );

  // Steps 3 to 7: the same edits as part 1, plan only.
  const results = [];
  for (const s of SCENARIOS) {
    const p = tfx(['plan', ...varArg('names', s.names)], opts);
    const c = counts(p.out);
    results.push({ ...s, ok: c !== null, ...(c ?? { add: -1, change: -1, destroy: -1 }), noChanges: /^No changes/m.test(p.out), touches: touched(p.out) });
    rec.step(
      `terraform plan -var 'names=${JSON.stringify(s.names)}'   (${s.what})`,
      c ? planLines(p.out) : errorBlock(p.out, 12),
      NOTES[s.key],
    );
  }

  // Step 8: apply the middle removal for real.
  const mid = SCENARIOS.find((s) => s.key === 'remove_middle');
  const applyMid = tfx(['apply', '-auto-approve', ...varArg('names', mid.names)], opts);
  const am = applyCounts(applyMid.out);
  const filesAfter = existsSync(join(work, 'out')) ? readdirSync(join(work, 'out')).sort() : [];
  rec.step(
    `terraform apply -auto-approve -var 'names=["alpha","bravo","delta","echo"]'   (remove "charlie" for real)`,
    `${applyMid.out.split('\n').filter((l) => /Apply complete|Destroying\.\.\./.test(l)).join('\n')}\nout/: ${filesAfter.join(' ')}`,
    'One file destroyed, the other four untouched.',
  );

  // Steps 9 to 11: edits to the map of objects (the names list is back to its default: the apply above used -var, so state has four names; plan with the same four).
  const siteResults = [];
  for (const e of SITE_EDITS) {
    const p = tfx(['plan', ...varArg('names', mid.names), ...varArg('sites', e.sites)], opts);
    const c = counts(p.out);
    siteResults.push({ ...e, ...(c ?? { add: -1, change: -1, destroy: -1 }) });
    rec.step(
      `terraform plan -var 'sites=...'   (${e.what})`,
      c ? planLines(p.out) : errorBlock(p.out, 12),
      e.key === 'site_edit'
        ? 'Only the site whose value changed is touched, and it is replaced because the file content changed. The other sites and all the item files are not listed.'
        : e.key === 'site_remove'
          ? 'Removing a key removes that one address.'
          : 'A new key is one add. Nothing else moves.',
    );
  }

  // Step 12: keys that are unknown until apply. The error first (a demo that never changes), then your unknown-keys/ folder.
  const demoDir = join(work, 'demo-unknown');
  mkdirSync(demoDir, { recursive: true });
  writeFileSync(
    join(demoDir, 'main.tf'),
    [
      'terraform {',
      '  required_providers {',
      '    random = { source = "hashicorp/random", version = "~> 3.9" }',
      '    local  = { source = "hashicorp/local", version = "~> 2.9" }',
      '  }',
      '}',
      'resource "random_pet" "app" {',
      '  count = 2',
      '}',
      'resource "local_file" "pet_file" {',
      '  for_each = toset(random_pet.app[*].id)',
      '  filename = "${path.module}/pets/${each.key}.txt"',
      '  content  = "pet ${each.key}\\n"',
      '}',
      '',
    ].join('\n'),
  );
  const demoInit = tfx(['init'], { cwd: demoDir });
  if (demoInit.code !== 0) throw new Error(`terraform init failed in the demo folder:\n${demoInit.out}`);
  const demoPlan = tfx(['plan'], { cwd: demoDir });
  const demoRejected = demoPlan.code !== 0 && /Invalid for_each argument/.test(demoPlan.out);
  rec.step(
    'terraform plan   (demo: for_each = toset(random_pet.app[*].id), keys known only after apply)',
    `${planLines(demoPlan.out).split('\n').slice(-1).join('')}\n${errorBlock(demoPlan.out, 18)}`,
    'Terraform has to know the KEYS of a for_each at plan time, to know how many resources and which addresses. The pet names are only known after the pets are created, so it cannot plan. Keep unknown things as values and write the keys yourself.',
  );
  const uk = join(work, 'unknown-keys');
  const ukInit = tfx(['init'], { cwd: uk });
  if (ukInit.code !== 0) throw new Error(`terraform init failed in unknown-keys:\n${ukInit.out}`);
  const ukPlan = tfx(['plan'], { cwd: uk });
  const ukCounts = counts(ukPlan.out);
  rec.step(
    'terraform plan   (your unknown-keys/main.tf)',
    ukCounts ? planLines(ukPlan.out) : errorBlock(ukPlan.out, 14),
    ukCounts ? 'With the keys written in the configuration (first, second) and only the values unknown, the plan works: two pets and two files.' : 'It still fails: the keys come from the pets. Write the keys yourself.',
  );

  // Facts.
  setFact('c3.p2.baseline_plan_ok', true);
  setFact('c3.p2.baseline_added_count', a0.added);
  for (const r of results) {
    setFact(`c3.p2.${r.key}_plan_ok`, r.ok);
    setFact(`c3.p2.${r.key}_add_count`, r.add);
    setFact(`c3.p2.${r.key}_change_count`, r.change);
    setFact(`c3.p2.${r.key}_destroy_count`, r.destroy);
  }
  setFact('c3.p2.reverse_no_changes', results.find((r) => r.key === 'reverse').noChanges);
  setFact('c3.p2.middle_apply_added_count', am?.added ?? -1);
  setFact('c3.p2.middle_apply_destroyed_count', am?.destroyed ?? -1);
  setFact('c3.p2.files_after_middle_apply_count', filesAfter.length);
  for (const r of siteResults) {
    setFact(`c3.p2.${r.key}_add_count`, r.add);
    setFact(`c3.p2.${r.key}_change_count`, r.change);
    setFact(`c3.p2.${r.key}_destroy_count`, r.destroy);
  }
  setFact('c3.p2.unknown_keys_error_shown', demoRejected);
  setFact('c3.p2.unknown_keys_fixed_plan_ok', ukCounts !== null);
  setFact('c3.p2.unknown_keys_fixed_add_count', ukCounts?.add ?? -1);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, runner mode ${mode()}, Node ${process.versions.node}`);
    // Chart: destroys with count (part 1's recorded facts, when present) and with for_each (this run).
    const bars = [];
    for (const r of results.filter((x) => ['remove_first', 'remove_middle', 'remove_last', 'reverse'].includes(x.key))) {
      const c = getFact(`c3.p1.${r.key}_destroy_count`);
      if (typeof c === 'number' && c >= 0) bars.push({ label: `count: ${r.label}`, value: c });
      bars.push({ label: `for_each: ${r.label}`, value: Math.max(0, r.destroy) });
    }
    writeFileSync(join(here, 'chart.svg'), barsSvg({ title: 'Resources destroyed by one edit: count versus for_each', unit: 'destroyed', bars }));
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c3.p2');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
}
