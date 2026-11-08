// Challenge 5, part 3: lost state and restore.
// Run: node challenges/challenge-5-state/part-3-lost-state-and-restore/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the reference solution instead of your files.
//
// Day 1 and day 2 applies create a labelled container (tfc-c5-app) and a small record. Then the state is lost.
// Recovery A restores terraform.tfstate.backup. Recovery B (the backup is gone too) imports the container.

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { cleanup, leftovers, run as docker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, initRetry, lines, pick, planSummary, stateInfo, tfRetry } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 5, part 3: lost state and restore');
const work = prepareWork(import.meta.url);
const live = join(work, 'live');
const keep = join(work, 'keep');
mkdirSync(live, { recursive: true });
mkdirSync(keep, { recursive: true });

const NAME = 'tfc-c5-app';
const tfc = (args) => tfRetry(args, { cwd: live, docker: true });
const planLines = (out) => lines(out).filter((l) => /^  # .* (will be|must be)|^Plan:|^No changes|forces replacement|^Error/.test(l)).join('\n');
const containerId = () => docker(['inspect', '--format', '{{.Id}}', NAME]).stdout.trim();
const running = () => docker(['ps', '--filter', `name=^${NAME}$`, '--filter', 'label=tfc.challenge=5', '--format', '{{.Names}} ({{.Status}})']).stdout.trim() || '(none)';
const stateFiles = () => readdirSync(live).filter((f) => /^terraform\.tfstate/.test(f)).sort();
const describe = (f) => {
  const i = stateInfo(join(live, f));
  return `${f.padEnd(26)} serial ${String(i.serial).padEnd(2)} ${i.resources.join(', ') || '(empty)'}`;
};

try {
  cleanup(N);

  // Day 1 and day 2.
  copyFileSync(join(work, 'before', 'main.tf'), join(live, 'main.tf'));
  initRetry(live, ['init'], { docker: true });
  const d1 = tfc(['apply', '-auto-approve']);
  rec.step('terraform apply -auto-approve     (day 1: the container)', pick(d1.out, /^docker_container|Apply complete|^Error/), 'The state file terraform.tfstate now holds the container.');
  copyFileSync(join(work, 'main.tf'), join(live, 'main.tf'));
  const d2 = tfc(['apply', '-auto-approve']);
  rec.step('terraform apply -auto-approve     (day 2: the container plus a release record)', pick(d2.out, /^terraform_data|Apply complete|^Error/), 'A second apply. From now on Terraform keeps the state before this apply as terraform.tfstate.backup.');
  rec.step('ls terraform.tfstate* ; docker ps --filter label=tfc.challenge=5', `${stateFiles().map(describe).join('\n')}\ncontainer: ${running()}`, 'The backup is one apply behind: it does not know the release record. That matters later.');
  const id1 = containerId();
  setFact('c5.p3.state_resources_before_count', stateInfo(join(live, 'terraform.tfstate')).resources.length);
  setFact('c5.p3.backup_resources_before_count', stateInfo(join(live, 'terraform.tfstate.backup')).resources.length);

  // Lose the state.
  copyFileSync(join(live, 'terraform.tfstate.backup'), join(keep, 'terraform.tfstate.backup'));
  rmSync(join(live, 'terraform.tfstate'));
  const lost = tfc(['state', 'list']);
  rec.step('(the state file is deleted by mistake; the backup is copied aside first)  terraform state list ; docker ps', `terraform state list: ${lines(lost.out).join(' ') || '(empty)'}\ncontainer: ${running()}`, 'Terraform remembers nothing. The container still runs: the real world does not care that the state is gone. The copy aside matters, as you will see.');
  setFact('c5.p3.state_list_after_loss_count', /No state file was found/.test(lost.out) ? 0 : lines(lost.out).length);
  setFact('c5.p3.container_survives_loss', running() !== '(none)');

  const pl = tfc(['plan']);
  const sl = planSummary(pl.out);
  rec.step('terraform plan', planLines(pl.out), 'With no state, Terraform plans to create everything again, including the container that is already there.');
  setFact('c5.p3.plan_lost_add_count', sl.add);
  setFact('c5.p3.plan_lost_destroy_count', sl.destroy);

  const bad = tfc(['apply', '-auto-approve']);
  const conflict = lines(bad.out).find((l) => /Conflict\. The container name/.test(l)) ?? '';
  rec.step('terraform apply -auto-approve', `${lines(bad.out).filter((l) => /^(terraform_data|docker_container)|^Error/.test(l)).join('\n')}\n[exit code ${bad.code}]`, 'The apply tries to create a second container with the same name and Docker refuses. The error is the real world telling you the state does not match.');
  setFact('c5.p3.apply_lost_exit_code', bad.code);
  setFact('c5.p3.apply_conflict_error', conflict.replace(/^Error: Unable to create container: Error response from daemon: /, '').replace(/"\/tfc-c5-app" is already in use by container "[0-9a-f]+"/, '"/tfc-c5-app" is already in use by container "<id>"') || 'none');
  const backupAfter1 = stateInfo(join(live, 'terraform.tfstate.backup'));
  const again = tfc(['apply', '-auto-approve', '-replace=terraform_data.release']);
  const backupAfter2 = stateInfo(join(live, 'terraform.tfstate.backup'));
  rec.step(
    'terraform apply -auto-approve -replace=terraform_data.release     (a colleague tries something small)   then: what terraform.tfstate.backup holds',
    `apply exit code ${again.code}\nbackup after the first failed apply:   ${backupAfter1.resources.join(', ') || '(empty)'}\nbackup after the apply with -replace: ${backupAfter2.resources.join(', ') || '(empty)'}`,
    'The failed applies wrote nothing new, so the first backup survived them. This apply replaced a resource, wrote the state, and so copied the half-written state over the backup. The container is gone from the only backup. Copy the backup aside before anything else touches the folder.',
  );
  setFact('c5.p3.backup_has_container_after_first_failed_apply', backupAfter1.resources.includes('docker_container.app'));
  setFact('c5.p3.backup_has_container_after_replace_apply', backupAfter2.resources.includes('docker_container.app'));

  // Recovery A: restore the copy.
  rmSync(join(live, 'terraform.tfstate'), { force: true });
  copyFileSync(join(keep, 'terraform.tfstate.backup'), join(live, 'terraform.tfstate'));
  const pa = tfc(['plan']);
  const sa = planSummary(pa.out);
  rec.step('cp ../keep/terraform.tfstate.backup terraform.tfstate ; terraform plan     (recovery A)', planLines(pa.out), 'The container is tracked again. The plan wants only the release record, because the backup was taken before day 2 finished. A restored backup is always as old as its last apply.');
  setFact('c5.p3.restore_plan_add_count', sa.add);
  setFact('c5.p3.restore_plan_destroy_count', sa.destroy);
  const aa = tfc(['apply', '-auto-approve']);
  const pa2 = tfc(['plan']);
  rec.step('terraform apply -auto-approve ; terraform plan', `${pick(aa.out, /^terraform_data|Apply complete|^Error/)}\n${planLines(pa2.out)}`, 'One resource added, then No changes. Recovery A worked, and the container id did not change.');
  setFact('c5.p3.restore_final_no_changes', planSummary(pa2.out).none);
  setFact('c5.p3.restore_container_id_unchanged', containerId() === id1);

  // Recovery B: no state, no backup. Import.
  for (const f of stateFiles()) rmSync(join(live, f), { force: true });
  rec.step('rm terraform.tfstate* ; terraform state list     (the backup is gone too)', `terraform state list: ${lines(tfc(['state', 'list']).out).join(' ') || '(empty)'}\ncontainer: ${running()}`, 'Worst case: nothing to restore. The container exists, and Terraform can adopt it with import.');
  const imp = tfc(['import', 'docker_container.app', containerId()]);
  rec.step('terraform import docker_container.app <the container id from docker inspect>', pick(imp.out, /Import (successful|prepared)|^Error|Importing from ID/).replace(/ID "[0-9a-f]{64}"/, 'ID "<id>"'), imp.code === 0 ? 'The container is in the state again. import adds one resource and checks nothing: always plan next.' : 'The import failed.');
  setFact('c5.p3.import_exit_code', imp.code);
  const pi = tfc(['plan']);
  const si = planSummary(pi.out);
  const forcing = lines(pi.out).filter((l) => /forces replacement/.test(l)).length;
  rec.step('terraform plan     (recovery B, after the import)', planLines(pi.out), si.destroy > 0 ? 'The plan wants to DESTROY the container you just adopted. The Docker provider cannot read the environment and the labels back from a running container, so they look changed and force a replacement. Do not apply this plan.' : 'The plan wants the release record and a harmless in-place update of arguments the provider cannot read back (they carry the lifecycle block: ignore_changes). Nothing is destroyed.');
  setFact('c5.p3.import_plan_add_count', si.add);
  setFact('c5.p3.import_plan_change_count', si.change);
  setFact('c5.p3.import_plan_destroy_count', si.destroy);
  setFact('c5.p3.import_plan_forces_replacement_count', forcing);
  if (si.destroy === 0) {
    const ai = tfc(['apply', '-auto-approve']);
    const pf = tfc(['plan']);
    rec.step('terraform apply -auto-approve ; terraform plan', `${pick(ai.out, /^terraform_data|^docker_container|Apply complete|^Error/)}\n${planLines(pf.out)}\ncontainer id unchanged: ${containerId() === id1}`, 'Adopted without recreating. This is the whole point of import.');
    setFact('c5.p3.import_final_no_changes', planSummary(pf.out).none);
    setFact('c5.p3.import_container_id_unchanged', containerId() === id1);
  } else {
    rec.step('(run.mjs stops here and does not apply)', 'An apply would stop and delete tfc-c5-app, then create it again.', 'Fix main.tf (see FIX in it) and run this part again.');
    setFact('c5.p3.import_final_no_changes', false);
    setFact('c5.p3.import_container_id_unchanged', containerId() === id1);
  }

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, ${useReference() ? 'reference solution' : 'starter files'}, Node ${process.versions.node}, TFC_MODE=${process.env.TFC_MODE ?? 'default'}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Resources the plan wants to add, by recovery state',
        unit: 'to add',
        bars: [
          { label: 'state lost', value: sl.add },
          { label: 'backup restored', value: sa.add },
          { label: 'container imported', value: si.add },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c5.p3');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  cleanup(N);
  const left = leftovers(N);
  setFact('c5.p3.leftover_count', left.containers + left.networks + left.volumes);
}
