// Challenge 9, part 1: find the secret.
// Run: node challenges/challenge-9-secrets/part-1-find-the-secret/run.mjs
// Add --record to also write results.md. Use --reference (or TFC_REFERENCE=1) to run the solution instead of your files.
//
// It applies a small config that holds two secrets (one fake value you pass in, one Terraform generates), then looks for
// the fake value in nine places and compares with your predictions.json. Only fake values are used. The generated
// password is a real random string, but it is never printed here: it is only searched for.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { mode } from '../../../toolkit/tf.js';
import { initPlain, runPlain, saveFacts, short, grep } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 9, part 1: find the secret');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });

const FAKE = 'fake-db-password-not-real';
const env = { TF_VAR_db_password: FAKE };

/** The places, in the order the run looks. The names are the keys of predictions.json and become fact names. */
const PLACES = [
  ['terraform.tfstate', 'tfstate'],
  ['terraform.tfstate.backup', 'tfstate_backup'],
  ['terraform show -json', 'show_json_state'],
  ['terraform output (no flags)', 'output_human'],
  ['terraform output -json', 'output_json'],
  ['terraform plan (the text you read)', 'plan_text'],
  ['terraform show -json <planfile>', 'show_json_plan'],
  ['app.conf (the file Terraform wrote)', 'app_conf'],
  ['TF_LOG=TRACE output', 'trace_log'],
];

const facts = { init_ok: false, apply_ok: false, generated_in_state: false, generated_in_output_json: false, trace_lines_count: 0, matches_prediction_count: 0 };
for (const [, k] of PLACES) facts[`found_${k}`] = false;
const save = () => saveFacts('c9.p1', facts);

const found = new Map();
let generated = '';

/** A few evidence lines: the lines that hold the secret, with the generated password hidden. */
function evidence(text, max = 3) {
  const hide = (l) => (generated ? l.replaceAll(generated, '<generated>') : l);
  const lines = text.split('\n').filter((l) => l.includes(FAKE)).map((l) => hide(l.trim()).slice(0, 120));
  return lines.slice(0, max);
}

function look(key, name, text, command, noteFound, noteNot) {
  const hit = text.includes(FAKE);
  found.set(key, hit);
  facts[`found_${name}`] = hit;
  const ev = hit ? evidence(text) : [];
  return { hit, ev, command, note: hit ? noteFound : noteNot };
}

function add(r, extra = []) {
  rec.step(r.command, short([`fake secret in plain text: ${r.hit ? 'YES' : 'no'}`, ...r.ev, ...extra].join('\n')), r.note);
}

async function main() {
  const i = await initPlain(work);
  facts.init_ok = i.code === 0;
  rec.step('terraform init', short(grep(i.out, /^- (Find|Install)|^Terraform has been|^Error/).join('\n')), 'init downloads the random and local providers.');
  if (i.code !== 0) return stop('terraform init failed.');

  // plan text and plan file
  const p = runPlain(['plan', '-out=tfplan'], work, env);
  add(look('terraform plan (the text you read)', 'plan_text', p.out, 'TF_VAR_db_password=<fake> terraform plan -out=tfplan', 'The plan text shows the secret.', 'The plan text hides it: sensitive values print as (sensitive value).'), grep(p.out, /sensitive value/).slice(0, 3).map((l) => l.trim()));
  const sp = runPlain(['show', '-json', 'tfplan'], work, env);
  add(look('terraform show -json <planfile>', 'show_json_plan', sp.stdout, 'terraform show -json tfplan', 'The plan file holds the value, and the JSON view prints it. A saved plan is a secret file.', 'Not found in the plan JSON.'));

  const a = runPlain(['apply', 'tfplan'], work, env);
  facts.apply_ok = a.code === 0;
  rec.step('terraform apply tfplan', short(grep(a.out, /Apply complete|^Error/).join('\n')), 'Two resources and two outputs.');
  if (a.code !== 0) return stop(`terraform apply failed:\n${short(a.out, 8)}`);

  // state, show, outputs, the file on disk
  const state = readFileSync(join(work, 'terraform.tfstate'), 'utf8');
  const parsed = JSON.parse(state);
  generated = parsed.resources.find((r) => r.type === 'random_password')?.instances?.[0]?.attributes?.result ?? '';
  facts.generated_in_state = generated !== '' && state.includes(generated);
  add(look('terraform.tfstate', 'tfstate', state, 'grep the fake value in terraform.tfstate', 'State is a plain JSON file. The value sits in the local_file content and in the output, sensitive or not.', 'Not found in state.'), [`the generated password is in state too: ${facts.generated_in_state ? 'YES' : 'no'}`]);

  const show = runPlain(['show', '-json'], work, env);
  add(look('terraform show -json', 'show_json_state', show.stdout, 'terraform show -json', '`show -json` prints the state as JSON. Outputs carry "sensitive": true and the value is printed anyway.', 'Not found.'));

  const oh = runPlain(['output'], work, env);
  add(look('terraform output (no flags)', 'output_human', oh.out, 'terraform output', '', 'The plain `output` command prints <sensitive> instead of the value.'), grep(oh.out, /sensitive/).map((l) => l.trim()));

  const oj = runPlain(['output', '-json'], work, env);
  facts.generated_in_output_json = generated !== '' && oj.stdout.includes(generated);
  add(look('terraform output -json', 'output_json', oj.stdout, 'terraform output -json', 'output -json prints sensitive values. This is the command a script or a CI step calls without thinking.', 'Not found.'), [`the generated password too: ${facts.generated_in_output_json ? 'YES' : 'no'}`]);

  const conf = readFileSync(join(work, 'app.conf'), 'utf8');
  add(look('app.conf (the file Terraform wrote)', 'app_conf', conf, 'cat app.conf', 'The file on disk holds the secret, as the config asked. That is its job; it is also a leak if the folder is shared.', 'Not found.'));

  // a second state write creates the backup
  const r = runPlain(['apply', '-auto-approve', '-replace=random_password.api'], work, env);
  const backup = readFileSync(join(work, 'terraform.tfstate.backup'), 'utf8');
  add(look('terraform.tfstate.backup', 'tfstate_backup', backup, 'terraform apply -replace=random_password.api, then grep terraform.tfstate.backup', 'Every state write keeps the previous state in terraform.tfstate.backup. The secret is in two files.', 'Not found.'), [`second apply: ${r.code === 0 ? 'ok' : 'failed'}`]);

  // the debug log
  const tr = runPlain(['apply', '-auto-approve', '-replace=local_file.app_conf'], work, { ...env, TF_LOG: 'TRACE' });
  facts.trace_lines_count = tr.out.split('\n').length;
  add(look('TF_LOG=TRACE output', 'trace_log', tr.out, 'TF_LOG=TRACE terraform apply -replace=local_file.app_conf', 'The trace log shows the secret.', `In this run the most detailed log (${facts.trace_lines_count} lines) did not print the fake value. Do not rely on that for other providers or tools: a provider that logs request bodies would.`));

  // predictions
  const pred = JSON.parse(readFileSync(join(work, 'predictions.json'), 'utf8'));
  const rows = PLACES.map(([key]) => ({ key, predicted: pred[key], found: found.get(key) }));
  facts.matches_prediction_count = rows.filter((x) => x.predicted === x.found).length;
  rec.step(
    'compare predictions.json with what the run found',
    short(rows.map((x) => `${x.predicted === x.found ? 'ok   ' : 'WRONG'} ${x.key.padEnd(40)} predicted ${String(x.predicted).padEnd(5)} found ${x.found}`).join('\n')),
    facts.matches_prediction_count === PLACES.length ? 'Every prediction matches.' : 'Some predictions are wrong. Look at each wrong line: where did you think the secret was safe?',
  );
  if (facts.matches_prediction_count !== PLACES.length) process.exitCode = 1;

  runPlain(['destroy', '-auto-approve'], work, env);
}

function stop(why) {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
}

try {
  save();
  await main();
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  save();
  if (recording() && useReference()) {
    rec.write(join(here, 'results.md'), `${process.platform}, runner ${mode()}, Terraform 1.17.1 in the pinned image, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c9.p1');
}
