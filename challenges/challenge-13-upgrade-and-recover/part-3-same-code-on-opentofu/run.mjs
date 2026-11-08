// Challenge 13, part 3: the same code on OpenTofu, state compatibility, and what only OpenTofu has.
// Run: node challenges/challenge-13-upgrade-and-recover/part-3-same-code-on-opentofu/run.mjs
// Add --record to also write results.md and chart.svg next to this file (the reference run does).
//
// It runs the part 1 code with Terraform 1.17.1 and with OpenTofu 1.13.9 (the pinned images), moves one state
// from one tool to the other and back, and then uses two OpenTofu features Terraform does not have:
// plan -exclude and state encryption (your encryption.tofu). No Docker objects are made.

import { copyFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { versionLine, tf } from '../../../toolkit/tf.js';
import { assertDocker } from '../../../toolkit/docker.js';
import { prepareWork, partDir, recording } from '../../../toolkit/part.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { tfx, grep, read, counts, applied, errorBlock, lockInfo, stateVersion, withTool, copyTf } from '../lib.mjs';

const here = partDir(import.meta.url);
const rec = new Recorder('Challenge 13, part 3: the same code on OpenTofu');
const PASS = 'tfc-c13-demo-passphrase-1';
const ENV = { TF_VAR_state_passphrase: PASS };
const TF = (args, cwd) => withTool('terraform', () => tfx(args, cwd, { env: ENV }));
const TOFU = (args, cwd) => withTool('tofu', () => tfx(args, cwd, { env: ENV }));
const ansi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
const providers = (text) => (text.match(/^provider "[^"]+"/gm) || []).map((l) => l.replace('provider ', '')).join('\n');

try {
  assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

let failed = false;
try {
  const work = prepareWork(import.meta.url);
  const folder = (name, { encryption = false } = {}) => {
    const dir = join(work, name);
    copyTf(work, dir, { keepLock: false });
    if (encryption) copyFileSync(join(work, 'encryption.tofu'), join(dir, 'encryption.tofu'));
    return dir;
  };

  // Step 1: two tools, two version lines.
  const tfLine = withTool('terraform', () => versionLine());
  const tofuLine = withTool('tofu', () => versionLine());
  rec.step('terraform version ; tofu version', `${tfLine}\n${tofuLine}`, 'Two programs from two projects. The language is the same HCL; the version numbers are unrelated.');
  setFact('c13.p3.terraform_version_line', tfLine);
  setFact('c13.p3.tofu_version_line', tofuLine);

  // Step 2: init, side by side.
  const dTf = folder('terraform');
  const dTofu = folder('tofu');
  const iTf = TF(['init'], dTf);
  const iTofu = TOFU(['init'], dTofu);
  const lockTf = read(join(dTf, '.terraform.lock.hcl'));
  const lockTofu = read(join(dTofu, '.terraform.lock.hcl'));
  rec.step(
    'terraform init ; tofu init ; grep provider .terraform.lock.hcl   (same two files, two folders)',
    `terraform: ${grep(iTf.out, /Installing hashicorp\/random|successfully initialized/, 2).replace(/\n/g, ' | ')}\ntofu:      ${grep(iTofu.out, /Installing hashicorp\/random|successfully initialized/, 2).replace(/\n/g, ' | ')}\nterraform lock:\n${providers(lockTf)}\ntofu lock:\n${providers(lockTofu)}`,
    'OpenTofu downloads from its own registry, registry.opentofu.org, and the lock file says so. Both registries serve the same provider versions, but the hashes differ: OpenTofu says its provider releases are not byte-for-byte identical to those of Terraform.',
  );
  const rTf = lockInfo(lockTf, 'registry.terraform.io/hashicorp/random');
  const rTofu = lockInfo(lockTofu, 'registry.opentofu.org/hashicorp/random');
  setFact('c13.p3.terraform_lock_registry', /registry\.terraform\.io\/hashicorp\/random/.test(lockTf) ? 'registry.terraform.io' : 'other');
  setFact('c13.p3.tofu_lock_registry', /registry\.opentofu\.org\/hashicorp\/random/.test(lockTofu) ? 'registry.opentofu.org' : 'other');
  setFact('c13.p3.same_random_version_in_both_locks', rTf?.version === rTofu?.version && !!rTf?.version);
  setFact('c13.p3.lock_hashes_identical', (lockTf.match(/"h1:[^"]+"/g) || []).join() === (lockTofu.match(/"h1:[^"]+"/g) || []).join());

  // Step 3: the same code, applied by each tool in its own folder.
  const aTf = TF(['apply', '-auto-approve'], dTf);
  const aTofu = TOFU(['apply', '-auto-approve'], dTofu);
  const pTf = TF(['plan'], dTf);
  const pTofu = TOFU(['plan'], dTofu);
  rec.step(
    'terraform apply ; tofu apply ; plan with each',
    `terraform: ${grep(aTf.out, /^Apply complete/, 1)}  then: ${grep(pTf.out, /No changes|^Plan:/, 1)}\ntofu:      ${grep(aTofu.out, /^Apply complete/, 1)}  then: ${grep(pTofu.out, /No changes|^Plan:/, 1)}`,
    'Same code, same result, same counts. For everyday configuration the two tools are interchangeable.',
  );
  setFact('c13.p3.terraform_apply_added_count', applied(aTf.out)?.added ?? -1);
  setFact('c13.p3.tofu_apply_added_count', applied(aTofu.out)?.added ?? -1);
  setFact('c13.p3.both_second_plans_empty', /No changes\./.test(pTf.out) && /No changes\./.test(pTofu.out));

  // Step 4: OpenTofu takes over a state that Terraform wrote.
  const dMove = join(work, 'terraform-to-tofu');
  copyTf(dTf, dMove, { keepLock: true });
  copyFileSync(join(dTf, 'terraform.tfstate'), join(dMove, 'terraform.tfstate'));
  copyFileSync(join(dTf, 'greeting.txt'), join(dMove, 'greeting.txt'));
  const stateBefore = stateVersion(dMove);
  const mInit = TOFU(['init'], dMove);
  const mPlan = TOFU(['plan'], dMove);
  rec.step(
    'tofu init ; tofu plan   (a folder with a state that Terraform wrote and a lock file that says registry.terraform.io)',
    `${ansi(grep(mInit.out, /automatically updated|=> registry|were preserved|successfully initialized/, 6))}\n${grep(mPlan.out, /No changes|^Plan:|^Error/, 2)}`,
    'OpenTofu reads the state, rewrites the lock file from registry.terraform.io to registry.opentofu.org, keeps the versions, and drops the hashes. The plan is empty: the move is a non-event. The lock file change is the only thing to commit.',
  );
  setFact('c13.p3.tofu_rewrites_lock_registry', /registry\.terraform\.io\/hashicorp\/local => registry\.opentofu\.org\/hashicorp\/local/.test(mInit.out));
  setFact('c13.p3.tofu_plan_on_terraform_state_no_changes', /No changes\./.test(mPlan.out));

  // Step 5: OpenTofu writes the state, Terraform reads it back.
  const wr = TOFU(['apply', '-auto-approve', '-replace=random_pet.name'], dMove);
  const stateAfter = stateVersion(dMove);
  const stateText = read(join(dMove, 'terraform.tfstate'));
  const addrs = [...new Set([...stateText.matchAll(/provider\[\\"(registry\.[a-z.]+)\//g)].map((m) => m[1]))].join(', ');
  // Plain tf(), not tfx(): tfx would repeat the plan after running init, which hides exactly the error we want to show.
  const back = withTool('terraform', () => tf(['plan'], { cwd: dMove, env: ENV }));
  const fix = TF(['init', '-upgrade'], dMove);
  const back2 = TF(['plan'], dMove);
  rec.step(
    'tofu apply -replace=random_pet.name ; terraform plan ; terraform init -upgrade ; terraform plan',
    `state written by: ${stateBefore} -> ${stateAfter}   provider addresses in the state: ${addrs}\ntofu apply: ${grep(wr.out, /^Apply complete/, 1)}\nterraform plan: ${errorBlock(back.out, 4).replace(/\n/g, ' | ')}\nterraform init -upgrade: ${fix.code === 0 ? 'ok' : errorBlock(fix.out, 3)}\nterraform plan: ${grep(back2.out, /No changes|^Plan:|^Error/, 1)}`,
    'Going back is not free. After OpenTofu applied, the lock file names registry.opentofu.org, and Terraform stops with "Inconsistent dependency lock file". terraform init -upgrade fixes the lock file, and the plan is empty again. Both tools can share a state, one after the other, if you re-run init each time you switch.',
  );
  setFact('c13.p3.state_version_after_tofu_apply', stateAfter ?? 'none');
  setFact('c13.p3.terraform_plan_after_tofu_error', /Inconsistent dependency lock file/.test(back.out) ? 'Inconsistent dependency lock file' : back.code === 0 ? 'no error' : 'other error');
  setFact('c13.p3.terraform_plan_after_init_upgrade_no_changes', /No changes\./.test(back2.out));

  // Step 6: -exclude, only OpenTofu.
  const dEx = folder('exclude');
  TOFU(['init'], dEx);
  TF(['init'], folder('exclude-terraform'));
  const plainPlan = TOFU(['plan'], dEx);
  const exPlan = TOFU(['plan', '-exclude=local_file.greeting'], dEx);
  const tfEx = TF(['plan', '-exclude=local_file.greeting'], join(work, 'exclude-terraform'));
  rec.step(
    'tofu plan ; tofu plan -exclude=local_file.greeting ; terraform plan -exclude=local_file.greeting',
    `tofu plan:          ${grep(plainPlan.out, /^Plan:/, 1)}\ntofu plan -exclude: ${grep(exPlan.out, /^Plan:/, 1)}  ${grep(exPlan.out, /^Warning: Resource targeting/, 1)}\nterraform plan -exclude:\n${tfEx.out.split('\n').filter((l) => l.trim()).slice(0, 3).join('\n')}`,
    '-exclude is the opposite of -target: plan everything except this address and what depends on it. OpenTofu has it (since 1.9); Terraform does not know the flag. Like -target it is for repairs, not for routine work.',
  );
  setFact('c13.p3.tofu_plain_plan_add_count', counts(plainPlan.out)?.add ?? -1);
  setFact('c13.p3.tofu_exclude_plan_add_count', counts(exPlan.out)?.add ?? -1);
  setFact('c13.p3.terraform_exclude_error', /flag provided but not defined: -exclude/.test(tfEx.out) ? 'flag provided but not defined: -exclude' : 'other');
  setFact('c13.p3.terraform_exclude_exit_code', tfEx.code);

  // Step 7: state encryption, your encryption.tofu.
  const dEnc = folder('encrypted', { encryption: true });
  const eInit = TOFU(['init'], dEnc);
  const eApply = TOFU(['apply', '-auto-approve'], dEnc);
  const encText = read(join(dEnc, 'terraform.tfstate'));
  const plainText = read(join(dTofu, 'terraform.tfstate'));
  const count = (t) => (t.match(/random_pet/g) || []).length;
  const isEnc = /"encrypted_data"/.test(encText);
  const ePlan = TOFU(['plan'], dEnc);
  rec.step(
    'tofu init ; tofu apply   (your encryption.tofu, passphrase from TF_VAR_state_passphrase) ; look inside terraform.tfstate',
    `${grep(eApply.out, /^Apply complete|^Error/, 2) || errorBlock(eInit.out, 4)}\nplain state:     "random_pet" appears ${count(plainText)} times\nencrypted state: "random_pet" appears ${count(encText)} times, "encrypted_data" present: ${isEnc}\nstate file starts: ${encText.slice(0, 60).replace(/"meta":.*/, '...')}\ntofu plan: ${grep(ePlan.out, /No changes|^Plan:|^Error/, 1)}`,
    'The state file is now one block of ciphertext. Nothing in it is readable, not the resource names, not the generated password that random_password stores. A plain state file keeps every secret in the clear.',
  );
  setFact('c13.p3.plain_state_name_occurrences_count', count(plainText));
  setFact('c13.p3.encrypted_state_name_occurrences_count', count(encText));
  setFact('c13.p3.state_is_encrypted', isEnc);
  setFact('c13.p3.tofu_plan_on_encrypted_state_no_changes', /No changes\./.test(ePlan.out));

  // Step 8: Terraform, and OpenTofu without the key, refuse that state.
  const tfRead = TF(['plan'], dEnc);
  renameSync(join(dEnc, 'encryption.tofu'), join(dEnc, 'encryption.off'));
  const noKey = TOFU(['plan'], dEnc);
  renameSync(join(dEnc, 'encryption.off'), join(dEnc, 'encryption.tofu'));
  const firstErr = (t) => ansi(t).split('\n').filter((l) => /Unsupported state file format|can not be read|encrypted/.test(l)).slice(0, 2).map((l) => l.trim()).join(' ');
  rec.step(
    'terraform plan ; tofu plan   (without encryption.tofu)',
    `terraform: exit ${tfRead.code}  ${firstErr(tfRead.out)}\ntofu without the encryption block: exit ${noKey.code}  ${firstErr(noKey.out)}`,
    'Terraform cannot read an OpenTofu-encrypted state at all. OpenTofu without the key cannot either. Encryption is a one-way door between the tools, and the passphrase is now part of your disaster recovery: lose it and the state is gone.',
  );
  setFact('c13.p3.terraform_reads_encrypted_state', tfRead.code === 0);
  setFact('c13.p3.terraform_encrypted_state_exit_code', tfRead.code);
  setFact('c13.p3.terraform_encrypted_state_error', /Unsupported state file format/.test(tfRead.out) ? 'Unsupported state file format' : 'other');
  setFact('c13.p3.tofu_without_key_error', /can not be read without an encryption configuration/.test(noKey.out) ? 'This state file is encrypted and can not be read without an encryption configuration' : 'other');

  if (!isEnc || !/No changes\./.test(ePlan.out)) {
    failed = true;
    console.log('\nNot finished: encryption.tofu must switch on state encryption, so that terraform.tfstate holds only "encrypted_data".');
  } else if (recording()) {
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Times "random_pet" can be read in the state file',
        unit: 'times',
        bars: [
          { label: 'plain state', value: count(plainText) },
          { label: 'encrypted state', value: count(encText) },
        ],
      }),
    );
  }
} finally {
  if (recording() && !failed) rec.write(join(here, 'results.md'), `Windows 11, Docker Desktop, ${versionLine()} (${process.env.TFC_MODE || 'auto'} mode) and OpenTofu 1.13.9, Node ${process.versions.node}`);
}
process.exit(failed ? 1 : 0);
