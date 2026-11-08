// Challenge 14, part 3: break it and recover it.
// Run: node challenges/challenge-14-capstone/part-3-break-it-and-recover-it/run.mjs
// Add --record to also write results.md and chart.svg. Add --reference (or TFC_REFERENCE=1) to run the solution.
//
// It breaks your dev environment three ways, on purpose, and recovers each time. The state is on the teaching state
// server (port 8852). Every error text below is real: copy what you see into capstone/RUNBOOK.md.
//   1. A failed apply: another program already holds the web port. The apply stops halfway.
//   2. A stuck lock: a job that was killed never released the state lock (made with the same LOCK request Terraform sends).
//   3. Lost state: the state file on the server is deleted. The containers keep running.

import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDocker, cleanup, leftovers, run as docker, safeArgs, waitFor } from '../../../toolkit/docker.js';
import { Recorder } from '../../../toolkit/record.js';
import { recording, useReference } from '../../../toolkit/part.js';
import { startStateServer } from '../../../toolkit/state-server.mjs';
import { barsSvg } from '../../../toolkit/bars.js';
import { versionLine, mode } from '../../../toolkit/tf.js';
import { N, applyCountsOf, containerId, containerState, envRunner, errorBlock, first, grep, httpGet, planCountsOf, prepareCapstone, saveFacts, serverState, short, stable, tail } from '../lib.mjs';
import { envChecks, failing, moduleChecks, runbookChecks } from '../shape.mjs';

const PORT = 8852;
const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 14, part 3: break it and recover it');

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareCapstone(import.meta.url, 3);
const cap = join(work, 'capstone');
const base = `http://127.0.0.1:${PORT}`;
const token = randomBytes(6).toString('hex');
const dev = envRunner({ work, env: 'dev', base, token });
const backups = join(cap, 'backups');

const facts = {
  runbook_failing_count: -1,
  failed_apply_exit_code: -1,
  failed_apply_error: '',
  failed_apply_state_resources_count: -1,
  failed_apply_web_status: '',
  failed_apply_cache_status: '',
  failed_apply_web_tainted_in_plan: false,
  recovery_plan_add_count: -1,
  recovery_plan_destroy_count: -1,
  recovery_apply_added_count: -1,
  recovery_apply_destroyed_count: -1,
  recovery_cache_kept: false,
  recovery_web_status: 0,
  lock_plan_exit_code: -1,
  lock_error_title: '',
  lock_error_names_holder: false,
  lock_held_before_unlock: false,
  force_unlock_ok: false,
  lock_held_after_unlock: true,
  plan_after_unlock_no_changes: false,
  backup_resources_count: -1,
  lost_state_files_count: -1,
  lost_plan_add_count: -1,
  lost_containers_still_running_count: -1,
  lost_apply_error: '',
  push_ok: false,
  restored_plan_no_changes: false,
  restored_containers_kept: false,
  restored_cache_value: '',
  leftover_count: -1,
};
const save = () => saveFacts('c14.p3', facts);
const stopHere = (why) => {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
};
let server;

/** Send one request with a method Node's fetch does not know (LOCK, UNLOCK). */
function send(method, path, body) {
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, method, headers: { authorization: `Basic ${Buffer.from(`tf:${token}`).toString('base64')}` } }, (res) => {
      let t = '';
      res.on('data', (d) => (t += d));
      res.on('end', () => ok({ code: res.statusCode, body: t }));
    });
    req.on('error', fail);
    req.end(body);
  });
}
const status = (names) => names.map((n) => `${n.padEnd(20)} ${containerState(n)}`).join('\n');
const WEB = 'tfc-c14-dev-web';
const CACHE = 'tfc-c14-dev-cache';
const webOk = async () => {
  try {
    return (await waitFor(async () => { const r = await httpGet('http://127.0.0.1:18401'); return r.status ? r : null; }, { timeoutMs: 30_000, what: 'the web container' })).status;
  } catch {
    return 0;
  }
};

async function main() {
  const rb = failing(runbookChecks(work));
  facts.runbook_failing_count = rb.length;
  const shape = failing([...moduleChecks(work), ...envChecks(work)]);
  if (shape.length) {
    save();
    return stopHere(`part 1 is not finished: ${shape.length} parts of the platform are missing (${shape[0].message}) Run the part 1 test.`);
  }
  server = await startStateServer({ port: PORT, dir: join(work, '.state'), tokens: { dev: token, prod: randomBytes(6).toString('hex') }, log: () => {} });
  const init = await dev.init();
  rec.step(`node toolkit/state-server.mjs --port ${PORT}   (started from run.mjs)\ncd capstone/envs/dev && terraform init -backend-config=backend.hcl`, first(init.out, /Successfully configured the backend|^Error/), 'The same dev environment as in part 1, with its state on the state server.');
  if (init.code !== 0) return stopHere('terraform init failed in capstone/envs/dev.');

  // 1. A failed apply.
  const sq = docker(['run', '-d', ...safeArgs(N, 'squatter'), '-p', '127.0.0.1:18401:80', 'nginx:1.27-alpine']);
  rec.step('docker run -d --name tfc-c14-squatter -p 127.0.0.1:18401:80 nginx:1.27-alpine', sq.code === 0 ? `${sq.stdout.trim().slice(0, 12)}` : sq.stderr, 'Another program already uses the port that the dev web container wants. Any program can: an old container, a dev server you forgot, another project.');
  if (sq.code !== 0) return stopHere('could not start the container that holds the port.');
  const bad = await dev.run(['apply', '-auto-approve', '-input=false']);
  facts.failed_apply_exit_code = bad.code;
  facts.failed_apply_error = first(bad.out, /^Error: Unable to start container/).replace(/^Error: /, '').replace(/ on endpoint [^ ]+ \([0-9a-f]+\)/, ' on endpoint <name> (<id>)').replace(/Bind for [0-9.]+:\d+ failed/, 'Bind for 127.0.0.1:18401 failed');
  rec.step('cd capstone/envs/dev && terraform apply -auto-approve   (the port is taken)', short(`${grep(stable(bad.out), /Creating\.\.\.|Creation complete|Apply complete/).split('\n').slice(0, 7).join('\n')}\n${errorBlock(bad.out, 9)}\nexit code ${bad.code}`, 24), 'Terraform built what it could, then the web container failed to start. The apply stopped. What it had built stays built.');
  const list = await dev.run(['state', 'list']);
  facts.failed_apply_state_resources_count = list.out.trim().split('\n').filter(Boolean).length;
  facts.failed_apply_web_status = containerState(WEB);
  facts.failed_apply_cache_status = containerState(CACHE);
  const plan1 = await dev.run(['plan', '-input=false']);
  const c1 = planCountsOf(plan1.out);
  facts.failed_apply_web_tainted_in_plan = /docker_container\.web is tainted, so must be replaced/.test(plan1.out);
  facts.recovery_plan_add_count = c1?.add ?? -1;
  facts.recovery_plan_destroy_count = c1?.destroy ?? -1;
  const cacheId = containerId(CACHE);
  rec.step(
    'terraform state list ; docker ps -a --filter label=tfc.challenge=14 ; terraform plan',
    short(`${list.out.trim()}\n${status([CACHE, WEB])}\n${grep(plan1.out, /is tainted|^Plan:/)}`, 24),
    'Three kinds of truth now disagree: the state has the web container, Docker has it in status "created" (never started), and the plan wants to replace it. The cache is healthy. Read all three before you touch anything.',
  );
  docker(['rm', '-f', 'tfc-c14-squatter']);
  const fix = await dev.run(['apply', '-auto-approve', '-input=false']);
  const fc = applyCountsOf(fix.out);
  facts.recovery_apply_added_count = fc?.added ?? -1;
  facts.recovery_apply_destroyed_count = fc?.destroyed ?? -1;
  facts.recovery_cache_kept = containerId(CACHE) === cacheId && cacheId !== '';
  facts.recovery_web_status = await webOk();
  rec.step(
    'docker rm -f tfc-c14-squatter ; terraform apply -auto-approve ; curl http://127.0.0.1:18401',
    `${grep(stable(fix.out), /^Apply complete|^Error/) || errorBlock(fix.out, 6)}\n${status([CACHE, WEB])}\ncache container unchanged: ${facts.recovery_cache_kept}\nweb: HTTP ${facts.recovery_web_status}`,
    'Free the port, then apply again. Terraform replaces only the half-built web container. The cache, and the data on its volume, was never touched.',
  );
  if (!fc) return stopHere('the recovery apply failed. Read the error above.');

  // 2. A stuck lock.
  const lockId = 'b5e1c0de-2d6a-4a63-9d2c-5f0f6c7e8a14';
  const info = { ID: lockId, Operation: 'OperationTypeApply', Info: '', Who: 'runner@github-actions-7', Version: '1.17.1', Created: new Date().toISOString(), Path: '' };
  const lk = await send('LOCK', '/lock/dev/platform', JSON.stringify(info));
  facts.lock_held_before_unlock = server.isLocked('dev/platform');
  const blocked = await dev.run(['plan', '-input=false']);
  facts.lock_plan_exit_code = blocked.code;
  facts.lock_error_title = /Error acquiring the state lock/.test(blocked.out) ? 'Error acquiring the state lock' : 'none';
  facts.lock_error_names_holder = /Who:\s+runner@github-actions-7/.test(blocked.out);
  rec.step(
    'terraform plan   (a pipeline job was killed in the middle of an apply and never released the lock)',
    short(`(LOCK request answered ${lk.code}: the lock is held)\n${errorBlock(blocked.out, 17)}\nexit code ${blocked.code}`, 24),
    'Nothing is running, yet the state is locked. The error names the lock: its ID, who took it, when, and with which version. Everything the runbook needs is in this message.',
  );
  const un = await dev.run(['force-unlock', '-force', lockId]);
  facts.force_unlock_ok = un.code === 0;
  facts.lock_held_after_unlock = server.isLocked('dev/platform');
  const after = await dev.run(['plan', '-input=false', '-detailed-exitcode']);
  facts.plan_after_unlock_no_changes = after.code === 0 && /No changes/.test(after.out);
  rec.step(
    `terraform force-unlock -force ${lockId} ; terraform plan`,
    `${first(un.out, /unlocked|^Error/)}\nlock held afterwards: ${facts.lock_held_after_unlock}\n${first(after.out, /No changes|^Plan:|^Error/)}`,
    'In this order: 1. find out whether the job that holds the lock is still alive (the Who and Created lines say where to look). 2. Only when it is dead, force-unlock with the ID from the error. 3. Plan before the next apply. force-unlock on a live run lets two applies write one state.',
  );

  // 3. Lost state.
  mkdirSync(backups, { recursive: true });
  docker(['exec', CACHE, 'valkey-cli', 'SET', 'capstone', 'hello']);
  const pull = await dev.run(['state', 'pull']);
  let pulled = null;
  try {
    pulled = JSON.parse(pull.out);
  } catch { /* not json */ }
  if (!pulled) return stopHere(`terraform state pull did not return a state:\n${short(pull.out, 6)}`);
  writeFileSync(join(backups, 'dev-before-loss.tfstate'), pull.out);
  facts.backup_resources_count = (pulled.resources || []).length;
  rec.step('terraform state pull > capstone/backups/dev-before-loss.tfstate', `serial ${pulled.serial}, lineage ${pulled.lineage.slice(0, 8)}..., ${facts.backup_resources_count} resources, ${pull.out.length} bytes`, 'A copy of the state, taken while everything is fine. Run it before every apply in the pipeline, and keep the copies somewhere that is not the state server. The file is in .gitignore because a state can hold secrets.');
  const ids = { web: containerId(WEB), cache: containerId(CACHE) };

  rmSync(join(server.dir, 'dev', 'platform.json'), { force: true });
  facts.lost_state_files_count = serverState(server, 'dev/platform') ? 1 : 0;
  const sl = await dev.run(['state', 'list']);
  const lostPlan = await dev.run(['plan', '-input=false']);
  const lc = planCountsOf(lostPlan.out);
  facts.lost_plan_add_count = lc?.add ?? -1;
  facts.lost_containers_still_running_count = [WEB, CACHE].filter((n) => containerState(n) === 'running').length;
  rec.step(
    '(the state file on the server is deleted)  terraform state list ; terraform plan ; docker ps',
    `terraform state list: ${sl.out.trim() || '(empty)'}\n${grep(lostPlan.out, /will be created|^Plan:/).split('\n').slice(0, 7).join('\n')}\n${status([CACHE, WEB])}`,
    'Terraform remembers nothing, so it plans to build everything again, including containers that already run. A plan that wants to add what you already have means the state is lost. Do not apply it.',
  );
  const wrong = await dev.run(['apply', '-auto-approve', '-input=false']);
  facts.lost_apply_error = first(wrong.out, /^Error: /).replace(/^Error: /, '');
  rec.step('terraform apply -auto-approve   (someone applies anyway)', short(`${grep(stable(wrong.out), /Creating\.\.\.|Creation complete|Apply complete/).split('\n').slice(0, 6).join('\n')}\n${errorBlock(wrong.out, 6)}\nexit code ${wrong.code}`, 24), 'Docker refuses a second network with the same name (the containers would be refused next: their names are taken too). The error is the real world telling you that the state does not match. The apply also wrote a new, partial state, so restoring the copy must overwrite it: that is why the next command has -force.');

  const push = await dev.run(['state', 'push', '-force', '../../backups/dev-before-loss.tfstate']);
  facts.push_ok = push.code === 0;
  const back = await dev.run(['plan', '-input=false', '-detailed-exitcode']);
  facts.restored_plan_no_changes = back.code === 0 && /No changes/.test(back.out);
  facts.restored_containers_kept = containerId(WEB) === ids.web && containerId(CACHE) === ids.cache;
  facts.restored_cache_value = docker(['exec', CACHE, 'valkey-cli', 'GET', 'capstone']).stdout.trim();
  rec.step(
    'terraform state push -force ../../backups/dev-before-loss.tfstate ; terraform plan\ndocker exec tfc-c14-dev-cache valkey-cli GET capstone',
    `push exit code ${push.code}${push.code === 0 ? '' : `\n${errorBlock(push.out, 5)}`}\n${first(back.out, /No changes|^Plan:|^Error/)}\ncontainers unchanged: ${facts.restored_containers_kept}\ncache value: ${facts.restored_cache_value}`,
    'Pushing the copy back makes Terraform remember again. The plan says No changes, the containers are the same ones, and the data on the volume is intact. The copy is only as new as the day you took it: anything applied since is missing, and the plan will show it.',
  );
}

try {
  cleanup(N);
  save();
  await main();
} catch (e) {
  console.error(`\nStopped: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  if (server) await server.close();
  cleanup(N);
  const left = leftovers(N);
  facts.leftover_count = left.containers + left.networks + left.volumes;
  save();
  rec.step(`docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=${N})`, `${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes`, 'Everything this part made is gone (cleanup by label). The images stay on your machine (keep_locally).');
  if (recording() && useReference() && facts.restored_plan_no_changes) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, ${versionLine()} (${mode()} mode), Node ${process.versions.node}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Objects the plan wants to add, at each moment of the three failures',
        unit: 'to add',
        bars: [
          { label: 'failed apply: web is tainted', value: facts.recovery_plan_add_count },
          { label: 'state lost', value: facts.lost_plan_add_count },
          { label: 'state restored', value: 0 },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c14.p3');
}
