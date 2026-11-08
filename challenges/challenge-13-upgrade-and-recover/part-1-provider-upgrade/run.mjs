// Challenge 13, part 1: a provider upgrade, what the lock file protects, and what changes with the Terraform version.
// Run: node challenges/challenge-13-upgrade-and-recover/part-1-provider-upgrade/run.mjs
// Add --record to also write results.md and chart.svg next to this file (the reference run does).
//
// It applies the OLD code with the OLD provider versions (before/), then upgrades the providers with your
// versions.tf and main.tf, and reads what changed: the lock file, the warnings, the plan. Last it runs the same
// code with Terraform 1.16.7 and 1.17.1 and compares.

import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { versionLine, tf } from '../../../toolkit/tf.js';
import { assertDocker } from '../../../toolkit/docker.js';
import { prepareWork, partDir, recording } from '../../../toolkit/part.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { tfx, grep, read, counts, validateJson, errorBlock, lockInfo, stateVersion, applyLegacy, withTerraformImage, copyTf } from '../lib.mjs';

const here = partDir(import.meta.url);
const rec = new Recorder('Challenge 13, part 1: a provider upgrade, the lock file, and two Terraform versions');
const RANDOM = 'registry.terraform.io/hashicorp/random';
const LOCAL = 'registry.terraform.io/hashicorp/local';
const lockLine = (text) => {
  const r = lockInfo(text, RANDOM);
  const l = lockInfo(text, LOCAL);
  return `random  version ${r?.version}  constraints ${r?.constraints}\nlocal   version ${l?.version}  constraints ${l?.constraints}`;
};

try {
  assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

let failed = false;
try {
  const work = prepareWork(import.meta.url);
  const legacy = join(work, 'legacy');

  // Step 1: the old code and the old versions.
  const first = applyLegacy(here, work);
  if (first.code !== 0) throw new Error(`The old code did not apply:\n${first.out}`);
  const oldLock = read(join(legacy, '.terraform.lock.hcl'));
  const oldValidate = validateJson(legacy);
  rec.step(
    'terraform apply   (the OLD code: before/, exact pins 3.1.3 and 2.1.0) ; cat .terraform.lock.hcl',
    `${grep(first.out, /Installing|^Apply complete/, 4)}\n${lockLine(oldLock)}\nterraform validate: ${oldValidate.warnings} warnings, ${oldValidate.errors} errors`,
    'The lock file recorded exactly what init chose. Nothing complains: this code is clean on these versions.',
  );
  const oldRandom = lockInfo(oldLock, RANDOM);
  const oldLocal = lockInfo(oldLock, LOCAL);
  setFact('c13.p1.old_random_version', oldRandom?.version ?? 'none');
  setFact('c13.p1.old_local_version', oldLocal?.version ?? 'none');
  setFact('c13.p1.old_code_warnings_count', oldValidate.warnings);

  // Step 2: what the lock file protects. Loosen the constraint to "anything newer" and run init again.
  writeFileSync(join(legacy, 'versions.tf'), read(join(here, 'versions.tf')));
  const loose = tfx(['init'], legacy);
  rec.step(
    'terraform init   (constraints loosened to ">= 3.1" and ">= 2.1")',
    grep(loose.out, /Reusing|Using previously|Installing|Error|successfully/, 8),
    'Newer releases exist, and the new constraints allow them. init still keeps the locked versions: the lock file wins over the constraint until you ask for an upgrade.',
  );
  setFact('c13.p1.loose_init_keeps_random_version', lockInfo(read(join(legacy, '.terraform.lock.hcl')), RANDOM)?.version === oldRandom?.version);

  // Step 3: the original code on the upgraded providers (a copy, so your folder stays clean).
  const orig = join(work, 'original');
  copyTf(legacy, orig, { skip: ['versions.tf'] });
  copyFileSync(join(work, 'terraform.tfstate'), join(orig, 'terraform.tfstate'));
  writeFileSync(
    join(orig, 'versions.tf'),
    'terraform {\n  required_providers {\n    random = {\n      source  = "hashicorp/random"\n      version = "~> 3.9"\n    }\n    local = {\n      source  = "hashicorp/local"\n      version = "~> 2.9"\n    }\n  }\n}\n',
  );
  const oInit = tfx(['init'], orig);
  const oUp = tfx(['init', '-upgrade'], orig);
  const oVal = validateJson(orig);
  const oPlan = tfx(['plan'], orig);
  rec.step(
    'terraform init ; terraform init -upgrade ; terraform validate ; terraform plan   (the ORIGINAL code, new constraints "~> 3.9" and "~> 2.9")',
    `${errorBlock(oInit.out, 8)}\n${grep(oUp.out, /Upgrading|Installing|Terraform has made some changes/, 6)}\nvalidate: ${oVal.warnings} warnings, ${oVal.errors} errors\n${oVal.summaries.join('\n')}\nplan: ${grep(oPlan.out, /No changes|^Plan:/, 2)}`,
    'Plain init refuses: the locked version does not fit the new constraint. init -upgrade installs the newest versions that fit. The plan is unchanged, and the upgrade brought two deprecation warnings. Today they are warnings.',
  );
  const origLock = read(join(orig, '.terraform.lock.hcl'));
  setFact('c13.p1.new_random_version', lockInfo(origLock, RANDOM)?.version ?? 'none');
  setFact('c13.p1.new_local_version', lockInfo(origLock, LOCAL)?.version ?? 'none');
  setFact('c13.p1.plain_init_refuses_new_constraint', /does not match configured version constraint/.test(oInit.out));
  setFact('c13.p1.original_code_warnings_after_upgrade_count', oVal.warnings);
  setFact('c13.p1.original_code_plan_no_changes_after_upgrade', /No changes\./.test(oPlan.out));
  setFact('c13.p1.deprecation_warning_text', /Attribute Deprecated/.test(oVal.summaries.join('\n')) ? 'Attribute Deprecated' : 'none');

  // Step 4: your files.
  const lockBefore = lockLine(read(join(work, '.terraform.lock.hcl')));
  const init = tfx(['init'], work);
  const up = tfx(['init', '-upgrade'], work);
  const lockAfter = lockLine(read(join(work, '.terraform.lock.hcl')));
  rec.step(
    'terraform init ; terraform init -upgrade   (your versions.tf)',
    `${errorBlock(init.out, 8) || grep(init.out, /successfully initialized/, 1)}\n${grep(up.out, /Upgrading|Installing|Terraform has made some changes|^Error/, 6)}\nbefore:\n${lockBefore}\nafter:\n${lockAfter}`,
    'The lock file is the record of an upgrade. Its diff belongs in the pull request, next to the code change.',
  );
  const yourInfo = lockInfo(read(join(work, '.terraform.lock.hcl')), RANDOM);
  setFact('c13.p1.your_random_version', yourInfo?.version ?? 'none');
  setFact('c13.p1.your_random_constraint', yourInfo?.constraints ?? 'none');

  const val = validateJson(work);
  const plan = tfx(['plan'], work);
  const pc = counts(plan.out);
  rec.step(
    'terraform validate -json ; terraform plan   (your main.tf)',
    `validate: ${val.warnings} warnings, ${val.errors} errors\n${val.summaries.join('\n')}\n${grep(plan.out, /No changes|^Plan:|^Warning|^Error|forces replacement/, 8)}`,
    'The goal: no warnings and no changes. A provider upgrade is done when the code uses the new names and the plan is empty.',
  );
  setFact('c13.p1.your_warnings_count', val.warnings);
  setFact('c13.p1.your_plan_add_count', pc?.add ?? -1);
  setFact('c13.p1.your_plan_change_count', pc?.change ?? -1);
  setFact('c13.p1.your_plan_destroy_count', pc?.destroy ?? -1);

  if (val.warnings !== 0 || !pc || pc.add + pc.change + pc.destroy !== 0 || !/^~>/.test(yourInfo?.constraints ?? '')) {
    failed = true;
    console.log('\nNot finished: the goal is a "~>" constraint for both providers, no warnings, and a plan with no changes.');
  }

  // Step 5: two Terraform releases, same code, same state.
  const t1 = '1.16.7';
  const v1 = withTerraformImage(`hashicorp/terraform:${t1}`, () => ({
    line: versionLine(),
    json: tf(['version', '-json'], { cwd: work }).stdout,
    init: tf(['init'], { cwd: work }).out,
    plan: tf(['plan'], { cwd: work }).out,
  }));
  const v2 = { line: versionLine(), json: tf(['version', '-json'], { cwd: work }).stdout, init: tf(['init'], { cwd: work }).out, plan: tf(['plan'], { cwd: work }).out };
  const hasFmt = (j) => /"format_version"/.test(j);
  const reuse = (t) => grep(t, /Reusing/, 1).split('\n')[0];
  rec.step(
    'terraform version ; terraform version -json ; terraform init ; terraform plan   (Terraform 1.16.7, then 1.17.1, same folder)',
    [
      `${v1.line}  plan: ${grep(v1.plan, /No changes|^Plan:/, 1)}`,
      `  init says:        ${reuse(v1.init).trim()}`,
      `  version -json has format_version: ${hasFmt(v1.json)}`,
      `${v2.line}  plan: ${grep(v2.plan, /No changes|^Plan:/, 1)}`,
      `  init says:        ${reuse(v2.init).trim()}`,
      `  version -json has format_version: ${hasFmt(v2.json)}`,
    ].join('\n'),
    'The plan is the same. What differs is small: the wording of init (1.17 names the version it reuses) and one more field in version -json. The upgrade of the tool itself was uneventful here; that is a result, not a promise.',
  );
  setFact('c13.p1.terraform_old_version_line', v1.line);
  setFact('c13.p1.terraform_new_version_line', v2.line);
  setFact('c13.p1.terraform_old_plan_no_changes', /No changes\./.test(v1.plan));
  setFact('c13.p1.terraform_new_plan_no_changes', /No changes\./.test(v2.plan));
  setFact('c13.p1.terraform_old_version_json_has_format_version', hasFmt(v1.json));
  setFact('c13.p1.terraform_new_version_json_has_format_version', hasFmt(v2.json));
  setFact('c13.p1.terraform_old_init_names_version', /Reusing version \d/.test(v1.init));
  setFact('c13.p1.terraform_new_init_names_version', /Reusing version \d/.test(v2.init));

  // Step 6: does an older Terraform refuse a state that a newer one wrote?
  tfx(['apply', '-auto-approve', '-replace=random_pet.name'], work);
  const sNew = stateVersion(work);
  const down = withTerraformImage(`hashicorp/terraform:${t1}`, () => tf(['apply', '-auto-approve', '-replace=random_pet.name'], { cwd: work }));
  const sOld = stateVersion(work);
  rec.step(
    'terraform apply -replace=random_pet.name   (1.17.1) ; same with 1.16.7 ; grep terraform_version terraform.tfstate',
    `state written by 1.17.1: terraform_version ${sNew}\n1.16.7 apply: ${grep(down.out, /^Apply complete|^Error/, 2)}\nstate after 1.16.7:     terraform_version ${sOld}`,
    'Terraform 1.16.7 did not refuse a state that 1.17.1 had written. It applied, and it wrote its own version into the file. Downgrading the tool is not blocked here, so the only protection is your team agreeing on one version (required_version).',
  );
  setFact('c13.p1.state_version_after_new_apply', sNew ?? 'none');
  setFact('c13.p1.state_version_after_old_apply', sOld ?? 'none');
  setFact('c13.p1.older_terraform_applied_on_newer_state', down.code === 0);

  if (!failed && recording()) {
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Warnings from terraform validate',
        unit: 'warnings',
        bars: [
          { label: 'old versions, old code', value: oldValidate.warnings },
          { label: 'new versions, old code', value: oVal.warnings },
          { label: 'new versions, your code', value: val.warnings },
        ],
      }),
    );
  }
} finally {
  if (recording() && !failed) rec.write(join(here, 'results.md'), `Windows 11, Docker Desktop, ${versionLine()} (${process.env.TFC_MODE || 'auto'} mode), Node ${process.versions.node}`);
}
process.exit(failed ? 1 : 0);
