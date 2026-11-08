// Challenge 2, part 1: types, validation and precedence.
// Run: node challenges/challenge-2-variables/part-1-types-validation-precedence/run.mjs
// Add --record to also write results.md next to this file.
//
// It reads your variables.tf, feeds it good and bad values (validation and type errors), then sets the
// variable "greeting" in seven different places, two at a time, to measure which place wins.
// Nothing is created: the configuration only has outputs.

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setFact } from '../../../toolkit/facts.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { Recorder } from '../../../toolkit/record.js';
import { mode } from '../../../toolkit/tf.js';
import { errorBlock, tfx } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 2, part 1: types, validation and precedence');
const work = prepareWork(import.meta.url);
const base = (extraEnv = {}) => ({ cwd: work, env: extraEnv });

/** Terraform prints a value for one console expression. Returns the text without the trailing newline. */
const consoleValue = (expr, args = [], env = {}) => tfx(['console', ...args], { ...base(env), input: `${expr}\n` });

try {
  const init = tfx(['init'], base());
  if (init.code !== 0) throw new Error(`terraform init failed:\n${init.out}`);

  // Step 1: the types, as Terraform understands them.
  const typeOf = consoleValue('type(var.replicas)', ['-var', 'project=demo']).stdout.trim();
  const values = consoleValue('jsonencode({ replicas = var.replicas, ports = var.ports, labels = var.labels, limits = var.limits })', ['-var', 'project=demo']).stdout.trim();
  const typePorts = consoleValue('type(var.ports)', ['-var', 'project=demo']).stdout.trim();
  rec.step(
    'terraform console   (three expressions)',
    `> type(var.replicas)\n${typeOf}\n> type(var.ports)\n${typePorts}\n> jsonencode({ replicas = ..., ports = ..., labels = ..., limits = ... })\n${values}`,
    typeOf === 'number' ? 'replicas is a number, ports a list of numbers. The type decides what Terraform accepts and how it converts.' : `replicas is a ${typeOf}. A count should be a number: fix its type in variables.tf.`,
  );

  // Step 2: a required variable with no value.
  const missing = tfx(['plan'], base());
  const missingRejected = missing.code !== 0 && /No value for required variable/.test(missing.out);
  rec.step('terraform plan   (no value for project, which has no default)', errorBlock(missing.out, 12), 'A variable without a default is required. Terraform never guesses it, and with no terminal (TF_INPUT=0) it does not ask: it stops.');

  // Step 3: validation.
  const tryPlan = (args) => tfx(['plan', ...args], base());
  const badName = tryPlan(['-var', 'project=Bad_Name']);
  const bigRep = tryPlan(['-var', 'project=demo', '-var', 'replicas=9']);
  const fracRep = tryPlan(['-var', 'project=demo', '-var', 'replicas=2.5']);
  const good = tryPlan(['-var', 'project=daftar', '-var', 'replicas=3']);
  const rejected = (r) => r.code !== 0 && /Invalid value for variable/.test(r.out);
  const showTry = (label, r) => `$ ${label}\n${r.code === 0 ? `(exit 0, accepted)\n${(/^Plan:.*$|^No changes.*$|^Changes to Outputs.*$/m.exec(r.out) ?? [''])[0]}` : `(exit ${r.code})\n${errorBlock(r.out, 11)}`}`;
  rec.step(
    'terraform plan -var project=Bad_Name  (and two more)',
    [showTry('plan -var project=Bad_Name', badName), showTry('plan -var project=demo -var replicas=9', bigRep)].join('\n'),
    rejected(badName) && rejected(bigRep)
      ? 'A validation block turns a silent mistake into an error that names the variable, the bad value and your message. It runs before anything is planned.'
      : 'Both were accepted. Nothing checks the value yet: add the validation blocks to variables.tf.',
  );
  rec.step(
    'terraform plan -var project=demo -var replicas=2.5  (and a good value)',
    [showTry('plan -var project=demo -var replicas=2.5', fracRep), showTry('plan -var project=daftar -var replicas=3', good)].join('\n'),
    rejected(fracRep) ? 'A number type alone allows 2.5. The validation says "whole number". A good value still passes.' : '2.5 copies was accepted. Add the whole-number check.',
  );

  // Step 4: types, conversion and type errors.
  const conv = consoleValue('var.replicas + 1', ['-var', 'project=demo', '-var', 'replicas=3']);
  const typeErrNum = tryPlan(['-var', 'project=demo', '-var', 'replicas=abc']);
  const typeErrList = tryPlan(['-var', 'project=demo', '-var', 'ports=[80,"x"]']);
  const typeRejected = (r) => r.code !== 0 && /Invalid value for input variable/.test(r.out);
  rec.step(
    'terraform console: var.replicas + 1 with -var replicas=3 ; then plan with replicas=abc and ports=[80,"x"]',
    `> var.replicas + 1   (replicas=3 given as text on the command line)\n${conv.stdout.trim()}\n$ plan -var replicas=abc\n${errorBlock(typeErrNum.out, 8)}\n$ plan -var 'ports=[80,"x"]'\n${errorBlock(typeErrList.out, 8)}`,
    'Text from the command line is converted to the declared type when it can be ("3" becomes 3) and rejected when it cannot. This is the type constraint at work, not a validation block.',
  );

  // Step 5: precedence duels. Every run sets greeting through two sources whose value is its own label.
  const files = ['terraform.tfvars', 'terraform.tfvars.json', 'a.auto.tfvars', 'b.auto.tfvars', 'extra.tfvars'];
  const clear = () => files.forEach((f) => rmSync(join(work, f), { force: true }));
  const put = {
    env: () => ({ TF_VAR_greeting: 'env' }),
    tfvars: () => writeFileSync(join(work, 'terraform.tfvars'), 'greeting = "tfvars"\n'),
    'tfvars-json': () => writeFileSync(join(work, 'terraform.tfvars.json'), '{ "greeting": "tfvars-json" }\n'),
    'auto-a': () => writeFileSync(join(work, 'a.auto.tfvars'), 'greeting = "auto-a"\n'),
    'auto-b': () => writeFileSync(join(work, 'b.auto.tfvars'), 'greeting = "auto-b"\n'),
    'var-file': () => writeFileSync(join(work, 'extra.tfvars'), 'greeting = "var-file"\n'),
  };
  /** Which source wins when `sources` are all set. `argOrder` lists '-var' / '-var-file' in command-line order. */
  const winner = (sources, argOrder = []) => {
    clear();
    let env = {};
    for (const s of sources) {
      if (s === 'var') continue;
      const r = put[s]();
      if (s === 'env') env = r;
    }
    const args = ['-var', 'project=demo'];
    for (const a of argOrder) args.push(...(a === 'var' ? ['-var', 'greeting=var'] : ['-var-file=extra.tfvars']));
    const out = consoleValue('var.greeting', args, env);
    return out.code === 0 ? out.stdout.trim().replace(/^"|"$/g, '') : `error: ${out.out.split('\n')[0]}`;
  };
  const DUELS = [
    ['duel1_env_vs_tfvars', 'TF_VAR_greeting versus terraform.tfvars', () => winner(['env', 'tfvars'])],
    ['duel2_tfvars_vs_tfvars_json', 'terraform.tfvars versus terraform.tfvars.json', () => winner(['tfvars', 'tfvars-json'])],
    ['duel3_tfvars_vs_auto', 'terraform.tfvars versus a.auto.tfvars', () => winner(['tfvars', 'auto-a'])],
    ['duel4_auto_a_vs_auto_b', 'a.auto.tfvars versus b.auto.tfvars', () => winner(['auto-a', 'auto-b'])],
    ['duel5_auto_vs_var_file', 'b.auto.tfvars versus -var-file=extra.tfvars', () => winner(['auto-b', 'var-file'], ['var-file'])],
    ['duel6_var_file_then_var', '-var-file=extra.tfvars written first, then -var', () => winner(['var-file', 'var'], ['var-file', 'var'])],
    ['duel7_var_then_var_file', '-var written first, then -var-file=extra.tfvars', () => winner(['var-file', 'var'], ['var', 'var-file'])],
  ];
  const predictions = JSON.parse(readFileSync(join(work, 'predictions.json'), 'utf8'));
  const duelResults = DUELS.map(([key, label, fn]) => {
    const real = fn();
    const said = String(predictions[key] ?? '').trim();
    return { key, label, real, said, ok: said === real };
  });
  rec.step(
    'terraform console: var.greeting   (seven duels; each source sets greeting to its own label)',
    duelResults.map((d) => `${d.label}\n   you: ${d.said || '(blank)'}   real: ${d.real}   ${d.ok ? 'ok' : 'MISS'}`).join('\n'),
    'Each duel sets only two sources and asks Terraform which value it used.',
  );

  // Step 6: the whole ladder, one source added at a time, lowest first.
  const ladderSources = ['env', 'tfvars', 'tfvars-json', 'auto-a', 'auto-b', 'var-file', 'var'];
  const ladder = [{ added: 'default only', win: winner([]) }];
  for (let i = 0; i < ladderSources.length; i++) {
    const set = ladderSources.slice(0, i + 1);
    const order = set.filter((s) => s === 'var-file' || s === 'var');
    ladder.push({ added: set[set.length - 1], win: winner(set, order) });
  }
  const labels = ['default', ...ladderSources];
  const ladderOk = ladder.every((l, i) => l.win === (i === 0 ? 'default' : labels[i]));
  rec.step(
    'terraform console: var.greeting   (add one source at a time, lowest first)',
    ladder.map((l) => `added ${l.added.padEnd(12)} winner: ${l.win}`).join('\n'),
    ladderOk ? 'Each newly added source wins over everything before it. This is the order, lowest to highest: default, TF_VAR_, terraform.tfvars, terraform.tfvars.json, *.auto.tfvars (alphabetical), -var-file and -var (in the order written).' : 'The order did not come out as documented. Read the winners above.',
  );
  clear();

  // Facts.
  setFact('c2.p1.replicas_type_text', typeOf);
  setFact('c2.p1.missing_required_rejected', missingRejected);
  setFact('c2.p1.bad_name_rejected', rejected(badName));
  setFact('c2.p1.replicas_too_high_rejected', rejected(bigRep));
  setFact('c2.p1.replicas_fraction_rejected', rejected(fracRep));
  setFact('c2.p1.good_values_accepted', good.code === 0);
  setFact('c2.p1.string_converted_to_number', conv.stdout.trim() === '4');
  setFact('c2.p1.type_error_number_rejected', typeRejected(typeErrNum));
  setFact('c2.p1.type_error_list_rejected', typeRejected(typeErrList));
  for (const d of duelResults) setFact(`c2.p1.${d.key}_winner_text`, d.real);
  setFact('c2.p1.duels_correct_count', duelResults.filter((d) => d.ok).length);
  setFact('c2.p1.documented_order_holds', ladderOk);
  setFact('c2.p1.precedence_order_text', ladder.map((l) => l.win).join(' < '));

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, runner mode ${mode()}, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log(`\nYou predicted ${duelResults.filter((d) => d.ok).length} of ${duelResults.length} duels. See your numbers with: node toolkit/show-facts.mjs c2.p1`);
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
}
