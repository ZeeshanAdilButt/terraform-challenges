// Challenge 0, part 1: check your toolkit.
// Run: node challenges/challenge-0-setup/part-1-check-your-toolkit/run.mjs
// Add --record to also write results.md next to this file.
//
// It runs the setup check, asks the runner for its version, then does a first init, validate, plan, apply and
// destroy on the tiny random_pet configuration in main.tf. Nothing here touches Docker containers or the cloud.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run as docker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { Recorder } from '../../../toolkit/record.js';
import { applyCounts, mode, planCounts, tf, toolName } from '../../../toolkit/tf.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const rec = new Recorder('Challenge 0, part 1: check your toolkit');
const work = prepareWork(import.meta.url);

/** Keep the lines from the first line that matches `from`, at most `max` lines. */
const tail = (text, from, max = 25) => {
  const lines = text.trimEnd().split('\n');
  const i = Math.max(0, lines.findIndex((l) => from.test(l)));
  return lines.slice(i, i + max).join('\n');
};

try {
  // Step 1: the setup check (the same script you run by hand).
  let check = '';
  try {
    check = execFileSync(process.execPath, [join(repo, 'toolkit', 'check-setup.mjs')], { encoding: 'utf8', cwd: repo });
  } catch (e) {
    check = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const failed = check.split('\n').filter((l) => /\sFAIL\s/.test(l)).length;
  rec.step(
    'node toolkit/check-setup.mjs',
    check,
    failed === 0
      ? 'No line says FAIL. The runner mode line says how Terraform will run: in the pinned container (docker) or the program on your PATH (local).'
      : 'A line says FAIL. Fix it before you go on.',
  );

  // Step 2: the version.
  const v = tf(['version']);
  rec.step(`${toolName()} version`, v.out, 'The reference runs use Terraform 1.17.1. A local program of 1.17 or newer behaves the same for these challenges.');

  // Step 3: the configuration.
  rec.step('cat main.tf', readFileSync(join(work, 'main.tf'), 'utf8'), 'The whole configuration: one provider, one resource, one output.');

  // Step 4: init.
  const init = tf(['init'], { cwd: work });
  rec.step(
    'terraform init',
    tail(init.out, /Initializing/),
    'init downloads the provider into .terraform/ and writes .terraform.lock.hcl. The lock file records the exact provider version.',
  );

  // Step 5: validate and plan.
  const val = tf(['validate'], { cwd: work });
  rec.step('terraform validate', val.out, 'validate checks the syntax and the types. It does not look at real infrastructure.');
  const plan = tf(['plan'], { cwd: work });
  const pc = planCounts(plan.out);
  rec.step('terraform plan', tail(plan.out, /Terraform used the selected providers/), 'The plan is a prediction. Nothing exists yet, so it says what it would add.');

  // Step 6: apply, read the output, destroy.
  const apply = tf(['apply', '-auto-approve'], { cwd: work });
  const ac = applyCounts(apply.out);
  rec.step('terraform apply -auto-approve', tail(apply.out, /random_pet\.toolkit: Creating/), 'apply makes the change. The pet name is random: yours differs from the recorded one.');
  const pet = tf(['output', '-raw', 'pet'], { cwd: work }).stdout.trim();
  rec.step('terraform output -raw pet', pet, 'An output is a value Terraform prints after an apply and keeps in state.');
  const destroy = tf(['destroy', '-auto-approve'], { cwd: work });
  const dm = /Destroy complete! Resources: (\d+) destroyed/.exec(destroy.out);
  rec.step('terraform destroy -auto-approve', tail(destroy.out, /random_pet\.toolkit: Destroying/), 'destroy removes what apply made. For random_pet that is only a record in state.');

  // Facts.
  const lock = join(work, '.terraform.lock.hcl');
  const lockText = existsSync(lock) ? readFileSync(lock, 'utf8') : '';
  const main = readFileSync(join(work, 'main.tf'), 'utf8');
  const ver = /(?:Terraform|OpenTofu) v([\d.]+)/.exec(v.out)?.[1] ?? 'unknown';
  const engine = docker(['version', '--format', '{{.Server.Version}}']).stdout.trim() || 'none';
  setFact('c0.p1.node_major_version', Number(process.versions.node.split('.')[0]));
  setFact('c0.p1.docker_engine_version', engine);
  setFact('c0.p1.runner_mode', mode());
  setFact('c0.p1.tool_version', ver);
  setFact('c0.p1.setup_checks_failed_count', failed);
  setFact('c0.p1.init_ok', init.code === 0);
  setFact('c0.p1.validate_ok', val.code === 0);
  setFact('c0.p1.lock_file_exists', lockText.includes('registry.terraform.io/hashicorp/random'));
  setFact('c0.p1.random_provider_version', /provider "registry\.terraform\.io\/hashicorp\/random" \{\s+version\s+=\s+"([\d.]+)"/.exec(lockText)?.[1] ?? 'none');
  setFact('c0.p1.provider_pinned', /version\s*=\s*"~>\s*3\.9"/.test(main));
  setFact('c0.p1.plan_add_count', pc?.add ?? -1);
  setFact('c0.p1.apply_added_count', ac?.added ?? -1);
  setFact('c0.p1.destroy_destroyed_count', dm ? Number(dm[1]) : -1);
  setFact('c0.p1.pet_words_count', pet ? pet.split('-').length : 0);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Engine ${engine}, runner mode ${mode()}, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c0.p1');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
}
