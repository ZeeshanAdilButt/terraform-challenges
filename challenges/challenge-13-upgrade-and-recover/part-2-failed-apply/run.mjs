// Challenge 13, part 2: an apply that fails halfway, and how to recover (fix and apply, -replace, a stuck lock).
// Run: node challenges/challenge-13-upgrade-and-recover/part-2-failed-apply/run.mjs
// Add --record to also write results.md and chart.svg next to this file (the reference run does).
//
// It applies the ORIGINAL main.tf (faults/main.tf: two containers publish the same host port), reads the partial
// state, then recovers with your main.tf. Then it replaces a healthy container on purpose with -replace, and
// last it makes a lock that a crashed run would leave behind, and removes it with force-unlock.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';

import { versionLine, tfAsync, hostName } from '../../../toolkit/tf.js';
import { assertDocker, cleanup } from '../../../toolkit/docker.js';
import { startStateServer } from '../../../toolkit/state-server.mjs';
import { prepareWork, partDir, recording } from '../../../toolkit/part.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, run, tfx, grep, read, copyTf, counts, applied, errorBlock, cleanAll } from '../lib.mjs';

const here = partDir(import.meta.url);
const rec = new Recorder('Challenge 13, part 2: a failed apply and the way back');
const PORT = 8840;
const idOf = (name) => run(['inspect', '--format', '{{.Id}}', name]).stdout.trim();
const status = (name) => run(['inspect', '--format', '{{.State.Status}}', name]).stdout.trim() || 'does not exist';
const short = (id) => (id ? `${id.slice(0, 12)}...` : '(none)');
const dockerView = () =>
  ['tfc-c13-first', 'tfc-c13-second', 'tfc-c13-third'].map((n) => `${n.padEnd(15)} ${status(n)}`).join('\n');

/** Send one request with a method Node's fetch does not know (LOCK, UNLOCK). */
function send(method, path, body) {
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, method }, (res) => {
      let t = '';
      res.on('data', (d) => (t += d));
      res.on('end', () => ok({ code: res.statusCode, body: t }));
    });
    req.on('error', fail);
    req.end(body);
  });
}

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

let failed = false;
let server;
try {
  cleanup(N);
  const work = prepareWork(import.meta.url);
  const broken = join(work, 'broken');
  mkdirSync(broken, { recursive: true });
  copyFileSync(join(here, 'faults', 'main.tf'), join(broken, 'main.tf'));
  const D = { docker: true };

  // Step 1: the apply that fails halfway.
  tfx(['init'], broken, D);
  const bad = tfx(['apply', '-auto-approve'], broken, D);
  rec.step(
    'terraform apply -auto-approve   (the ORIGINAL main.tf: "first" and "second" both publish host port 8841)',
    `${grep(bad.out, /Creating\.\.\.|Creation complete|Still creating/, 8)}\n${errorBlock(bad.out, 6)}\nexit code ${bad.code}`,
    'Terraform built the network and "first". "second" failed, and "third" was never tried. The apply stopped, and what it had built stays built.',
  );
  setFact('c13.p2.failed_apply_exit_code', bad.code);
  setFact('c13.p2.failed_apply_error', /port is already allocated/.test(bad.out) ? 'port is already allocated' : 'other');

  // Step 2: what the failure left behind.
  const list = tfx(['state', 'list'], broken, D);
  const taint = tfx(['plan'], broken, D);
  const tc = counts(taint.out);
  rec.step(
    'terraform state list ; docker ps -a ; terraform plan   (still the broken main.tf)',
    `${list.out.trim()}\n${dockerView()}\n${grep(taint.out, /tainted|must be replaced|will be created|^Plan:/, 6)}`,
    'Three kinds of truth now disagree: the state has two containers, Docker has two containers (one only "created", never started), and the plan wants to replace "second". Read all three before you touch anything.',
  );
  const stateContainers = list.out.trim().split('\n').filter((l) => l.startsWith('docker_container')).length;
  const runningAfterFailure = ['tfc-c13-first', 'tfc-c13-second', 'tfc-c13-third'].filter((n) => status(n) === 'running').length;
  setFact('c13.p2.state_resources_after_failure_count', list.out.trim().split('\n').filter(Boolean).length);
  setFact('c13.p2.second_docker_status_after_failure', status('tfc-c13-second'));
  setFact('c13.p2.third_docker_status_after_failure', status('tfc-c13-third'));
  setFact('c13.p2.second_tainted_in_plan', /docker_container\.second is tainted/.test(taint.out));
  setFact('c13.p2.plan_after_failure_add_count', tc?.add ?? -1);
  setFact('c13.p2.plan_after_failure_destroy_count', tc?.destroy ?? -1);
  const firstBefore = idOf('tfc-c13-first');

  // Step 3: recover with your main.tf.
  copyFileSync(join(work, 'main.tf'), join(broken, 'main.tf'));
  const fix = tfx(['plan'], broken, D);
  const fc = counts(fix.out);
  rec.step(
    'terraform plan   (your main.tf, same folder, same state)',
    grep(fix.out, /tainted|must be replaced|will be created|will be updated|^Plan:|^Error/, 8),
    'Fixing the file is half the recovery. The plan shows the other half: the half-built container is replaced, the missing one is created, and "first" is left alone.',
  );
  setFact('c13.p2.recovery_plan_add_count', fc?.add ?? -1);
  setFact('c13.p2.recovery_plan_destroy_count', fc?.destroy ?? -1);

  const good = tfx(['apply', '-auto-approve'], broken, D);
  const ac = applied(good.out);
  const firstAfter = idOf('tfc-c13-first');
  rec.step(
    'terraform apply -auto-approve ; terraform state list ; docker ps -a',
    `${grep(good.out, /^Apply complete|^Error/, 3) || errorBlock(good.out, 6)}\n${tfx(['state', 'list'], broken, D).out.trim()}\n${dockerView()}\n"first" id ${short(firstBefore)} -> ${short(firstAfter)}`,
    'All three containers run. The healthy container "first" was never touched: the apply picks up where the failure stopped.',
  );
  setFact('c13.p2.recovery_apply_added_count', ac?.added ?? -1);
  setFact('c13.p2.recovery_apply_destroyed_count', ac?.destroyed ?? -1);
  setFact('c13.p2.recovery_first_kept', firstBefore === firstAfter && firstBefore !== '');
  setFact('c13.p2.recovery_all_running', ['tfc-c13-first', 'tfc-c13-second', 'tfc-c13-third'].every((n) => status(n) === 'running'));
  if (good.code !== 0) {
    failed = true;
    console.log('\nStopping: your main.tf did not recover the apply. Two containers must not publish the same host port.');
  }

  if (!failed) {
    // Step 4: -replace.
    const rp = tfx(['plan', '-replace=docker_container.first'], broken, D);
    const rc = counts(rp.out);
    const doReplace = tfx(['apply', '-auto-approve', '-replace=docker_container.first'], broken, D);
    const firstNew = idOf('tfc-c13-first');
    rec.step(
      'terraform plan -replace=docker_container.first ; terraform apply -replace=docker_container.first',
      `${grep(rp.out, /will be replaced, as requested|^Plan:/, 3)}\n${grep(doReplace.out, /^Apply complete|^Error/, 2)}\n"first" id ${short(firstAfter)} -> ${short(firstNew)}`,
      '-replace asks for a new object even when Terraform thinks the old one is fine. It is the tool for "this container is up but wrong". It replaces what you name and nothing else.',
    );
    setFact('c13.p2.replace_plan_add_count', rc?.add ?? -1);
    setFact('c13.p2.replace_plan_destroy_count', rc?.destroy ?? -1);
    setFact('c13.p2.replace_says_as_requested', /will be replaced, as requested/.test(rp.out));
    setFact('c13.p2.replace_changed_id', firstNew !== firstAfter && firstNew !== '');

    // Step 5: a stuck lock. The state lives on a small http server, as in a team setup.
    server = await startStateServer({ port: PORT, dir: join(work, 'state-server') });
    const lockDir = join(work, 'lock');
    mkdirSync(lockDir, { recursive: true });
    const host = hostName();
    writeFileSync(join(lockDir, 'main.tf'), 'resource "terraform_data" "note" {\n  input = "hello"\n}\n');
    writeFileSync(
      join(lockDir, 'backend.tf'),
      `terraform {\n  backend "http" {\n    address        = "http://${host}:${PORT}/state/c13"\n    lock_address   = "http://${host}:${PORT}/lock/c13"\n    unlock_address = "http://${host}:${PORT}/lock/c13"\n    lock_method    = "LOCK"\n    unlock_method  = "UNLOCK"\n  }\n}\n`,
    );
    const lInit = await tfAsync(['init'], { cwd: lockDir });
    const lApply = await tfAsync(['apply', '-auto-approve'], { cwd: lockDir });
    // A run that is killed in the middle of an apply never sends UNLOCK. Here we leave the lock the same way.
    const lockId = 'b5e1c0de-2d6a-4a63-9d2c-5f0f6c7e8a11';
    const info = { ID: lockId, Operation: 'OperationTypeApply', Info: '', Who: 'ci-runner@build-7', Version: '1.17.1', Created: new Date().toISOString(), Path: '' };
    const lk = await send('LOCK', '/lock/c13', JSON.stringify(info));
    const blocked = await tfAsync(['plan'], { cwd: lockDir });
    const lockLines = blocked.out.split('\n').filter((l) => /Error acquiring|Lock Info|ID:|Path:|Operation:|Who:|Version:|Created:/.test(l)).map((l) => l.trim());
    rec.step(
      'terraform plan   (a run was killed in the middle of an apply and never released the lock)',
      `${lInit.code === 0 && lApply.code === 0 ? '(state on the http server: init and apply ok)' : lInit.out.slice(0, 300)}\nLOCK answered ${lk.code}\n${lockLines.join('\n')}`,
      'The error names the lock: its ID, who took it, when, and with which version. That is the information the runbook starts from.',
    );
    setFact('c13.p2.lock_error_title', /Error acquiring the state lock/.test(blocked.out) ? 'Error acquiring the state lock' : 'none');
    setFact('c13.p2.lock_plan_exit_code', blocked.code);
    setFact('c13.p2.lock_error_names_holder', /Who:\s+ci-runner@build-7/.test(blocked.out));

    const stillLocked = server.isLocked('c13');
    const unlock = await tfAsync(['force-unlock', '-force', lockId], { cwd: lockDir });
    const after = await tfAsync(['plan'], { cwd: lockDir });
    rec.step(
      'terraform force-unlock -force <ID> ; terraform plan',
      `lock held before: ${stillLocked}\n${grep(unlock.out.replace(/[[0-9;]*m/g, ''), /unlocked|Error/, 2)}\nlock held after: ${server.isLocked('c13')}\n${grep(after.out, /No changes|^Plan:|^Error/, 2)}`,
      'Runbook, in this order: 1. Find out who holds the lock and whether that run is still alive (CI page, the person). 2. Only if it is dead, run force-unlock with the ID from the error. 3. Run a plan before the next apply. force-unlock on a live run lets two applies write the same state.',
    );
    setFact('c13.p2.force_unlock_ok', unlock.code === 0);
    setFact('c13.p2.lock_held_after_force_unlock', server.isLocked('c13'));
    setFact('c13.p2.plan_after_unlock_no_changes', /No changes\./.test(after.out));

    if (recording()) {
      writeFileSync(
        join(here, 'chart.svg'),
        barsSvg({
          title: 'Containers that exist after each step',
          unit: 'containers',
          bars: [
            { label: 'in state after failure', value: stateContainers },
            { label: 'running after failure', value: runningAfterFailure },
            { label: 'running after recovery', value: 3 },
          ],
        }),
      );
    }
  }
} finally {
  if (server) await server.close();
  const { removed, left } = cleanAll();
  console.log(`\nCleanup: removed ${removed.containers.length} containers and ${removed.networks.length} networks; left ${left.containers + left.networks + left.volumes}.`);
  if (recording() && !failed) rec.write(join(here, 'results.md'), `Windows 11, Docker Desktop, Engine ${engine}, ${versionLine()} (${process.env.TFC_MODE || 'auto'} mode), Node ${process.versions.node}`);
}
process.exit(failed ? 1 : 0);
