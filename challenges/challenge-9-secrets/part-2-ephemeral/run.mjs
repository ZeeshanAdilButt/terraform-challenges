// Challenge 9, part 2: ephemeral resources and write-only attributes.
// Run: node challenges/challenge-9-secrets/part-2-ephemeral/run.mjs
// Add --record to also write results.md. Use --reference (or TFC_REFERENCE=1) to run the solution instead of your files.
//
// It applies your config, then looks for the generated password in state, in `show -json` and in a saved plan, and counts
// how many times the "store" command ran. It then shows two things on copies: what Terraform says when an ephemeral value
// is used where it would have to be saved, and how many write-only attributes the five course providers offer (none).

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { mode } from '../../../toolkit/tf.js';
import { errorBlock, firstMatch, grep, initPlain, runPlain, saveFacts, short } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 9, part 2: ephemeral resources and write-only attributes');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });

const facts = {
  init_ok: false,
  apply_ok: false,
  command_runs_after_plan_count: -1,
  command_runs_after_apply_count: -1,
  vault_file_has_secret: false,
  secret_in_state: true,
  secret_in_show_json: true,
  secret_in_plan_file: true,
  demo_ephemeral_into_resource_error: '',
  write_only_attribute_count: -1,
  ephemeral_resource_count: -1,
  providers_scanned_count: 0,
};
const save = () => saveFacts('c9.p2', facts);

const runs = (dir) => (existsSync(join(dir, 'runs.log')) ? readFileSync(join(dir, 'runs.log'), 'utf8').split('\n').filter(Boolean).length : 0);
const yn = (b) => (b ? 'YES' : 'no');

function stop(why) {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
}

async function main() {
  const i = await initPlain(work);
  facts.init_ok = i.code === 0;
  rec.step('terraform init', short(grep(i.out, /^- (Find|Install)|^Terraform has been|^Error/).join('\n')), 'init downloads the random and local providers.');
  if (i.code !== 0) return stop('terraform init failed.');

  const p = runPlain(['plan', '-out=tfplan'], work);
  facts.command_runs_after_plan_count = runs(work);
  rec.step('terraform plan -out=tfplan, then count the lines of runs.log', short([...grep(p.out, /^Plan:|^Error|ephemeral/i), `times the store command has run: ${facts.command_runs_after_plan_count}`].join('\n')), 'Ephemeral resources are opened in every phase, plan included, when their inputs are known. A command with side effects runs at plan time too.');
  if (p.code !== 0) return stop(`terraform plan failed:\n${errorBlock(p.out, 8)}`);

  const a = runPlain(['apply', 'tfplan'], work);
  facts.apply_ok = a.code === 0;
  facts.command_runs_after_apply_count = runs(work);
  rec.step('terraform apply tfplan, then count the lines of runs.log', short([...grep(a.out, /Apply complete|^Error/), `times the store command has run: ${facts.command_runs_after_apply_count}`].join('\n')), 'The store command ran again during apply. An ephemeral value is read anew in each phase.');
  if (a.code !== 0) return stop(`terraform apply failed:\n${errorBlock(a.out, 8)}`);

  // The consumer got the real value. Use it to search everywhere else. It is never printed.
  const secret = readFileSync(join(work, 'vault.out'), 'utf8').trim();
  facts.vault_file_has_secret = secret.length >= 16;
  const state = readFileSync(join(work, 'terraform.tfstate'), 'utf8');
  facts.secret_in_state = secret !== '' && state.includes(secret);
  const show = runPlain(['show', '-json'], work);
  facts.secret_in_show_json = secret !== '' && show.stdout.includes(secret);
  runPlain(['plan', '-out=tfplan2'], work);
  const planJson = runPlain(['show', '-json', 'tfplan2'], work);
  facts.secret_in_plan_file = secret !== '' && planJson.stdout.includes(secret);
  rec.step(
    'search the generated password in vault.out, terraform.tfstate, terraform show -json, and a second plan saved with -out',
    short([
      `vault.out holds it (the consumer received it): ${yn(facts.vault_file_has_secret)}`,
      `terraform.tfstate: ${yn(facts.secret_in_state)}`,
      `terraform show -json: ${yn(facts.secret_in_show_json)}`,
      `terraform show -json of a saved plan: ${yn(facts.secret_in_plan_file)}`,
    ].join('\n')),
    facts.secret_in_state || facts.secret_in_plan_file
      ? 'The password is still in state or in the plan. The resource keeps what it makes. Make it ephemeral.'
      : 'The consumer got the password. State, show and the saved plan never saw it.',
  );

  // Demo 1: an ephemeral value cannot go where it would be saved.
  const d1 = join(work, '..', 'work-demo-leak');
  rmSync(d1, { recursive: true, force: true });
  mkdirSync(d1, { recursive: true });
  writeFileSync(join(d1, 'main.tf'), [
    'terraform {',
    '  required_providers {',
    '    random = { source = "hashicorp/random", version = "~> 3.9" }',
    '    local  = { source = "hashicorp/local", version = "~> 2.9" }',
    '  }',
    '}',
    '',
    'ephemeral "random_password" "demo" {',
    '  length = 16',
    '}',
    '',
    'resource "local_file" "leak" {',
    '  filename = "leak.txt"',
    '  content  = ephemeral.random_password.demo.result',
    '}',
    '',
  ].join('\n'));
  await initPlain(d1);
  const e = runPlain(['plan'], d1);
  facts.demo_ephemeral_into_resource_error = firstMatch(e.out, /^Error/).replace(/^Error: /, '');
  rec.step('use the ephemeral password as the content of a local_file, then terraform plan', errorBlock(e.out, 10), 'Terraform refuses. A normal attribute is saved in state, so an ephemeral value cannot go there. Only a write-only attribute or another ephemeral resource can take it.');
  rmSync(d1, { recursive: true, force: true });

  // Demo 2: which of the course providers has any write-only attribute?
  const d2 = join(work, '..', 'work-demo-schema');
  rmSync(d2, { recursive: true, force: true });
  cpSync(join(here, 'schema-probe'), d2, { recursive: true });
  // The plugin cache is shared with other challenges: a parallel install can disturb a run. Try up to three times.
  let i2;
  let sc;
  let schema = null;
  for (let attempt = 0; attempt < 3 && !schema; attempt += 1) {
    i2 = await initPlain(d2);
    sc = runPlain(['providers', 'schema', '-json'], d2);
    try {
      schema = JSON.parse(sc.stdout).provider_schemas ?? null;
    } catch {
      schema = null;
    }
  }
  if (schema) {
    let wo = 0;
    let eph = 0;
    const names = [];
    for (const [prov, v] of Object.entries(schema)) {
      for (const kind of ['resource_schemas', 'data_source_schemas']) {
        for (const r of Object.values(v[kind] ?? {})) wo += Object.values(r.block?.attributes ?? {}).filter((x) => x.write_only).length;
      }
      for (const [n, r] of Object.entries(v.ephemeral_resource_schemas ?? {})) {
        eph += 1;
        names.push(n);
        wo += Object.values(r.block?.attributes ?? {}).filter((x) => x.write_only).length;
      }
      facts.providers_scanned_count += 1;
      void prov;
    }
    facts.write_only_attribute_count = wo;
    facts.ephemeral_resource_count = eph;
    rec.step(
      'terraform providers schema -json, counting attributes with write_only = true  (random, local, null, time, docker, and the built-in terraform provider)',
      short([`providers scanned: ${facts.providers_scanned_count}`, `write-only attributes found: ${wo}`, `ephemeral resources found: ${eph} (${names.sort().join(', ')})`].join('\n')),
      wo === 0 ? 'None of the providers this course uses has a write-only attribute. Write-only attributes need a provider that offers them; with these five, an ephemeral value can go to another ephemeral resource, as here.' : 'Some write-only attributes exist.',
    );
  } else {
    rec.step('terraform providers schema -json', errorBlock(i2.out + sc.out, 8), 'The schema probe failed.');
  }
  rmSync(d2, { recursive: true, force: true });
}

try {
  save();
  await main();
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (existsSync(join(work, 'terraform.tfstate'))) runPlain(['destroy', '-auto-approve'], work);
  save();
  if (recording() && useReference()) {
    rec.write(join(here, 'results.md'), `${process.platform}, runner ${mode()}, Terraform 1.17.1 in the pinned image, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c9.p2');
}
