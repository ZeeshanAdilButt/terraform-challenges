// Challenge 10, part 2: one directory per environment, one http state per environment, prod protected.
// Run: node challenges/challenge-10-environments/part-2-directories/run.mjs
// Add --record to also write results.md next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the solution instead of your files.
//
// It starts the teaching state server (toolkit/state-server.mjs) inside this process on port 8820, initialises
// envs/dev and envs/prod against it, applies both, changes dev and checks that prod's state did not move,
// then tries to destroy dev (allowed) and prod (should be refused), and shows what removing the guard does.
// Terraform runs through tfAsync because the server lives in this very process.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, leftovers, assertDocker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { planCounts, hostName, versionLine, mode } from '../../../toolkit/tf.js';
import { startStateServer } from '../../../toolkit/state-server.mjs';
import { N, terra, initWork, tail, grep, errorBlock, containers, listFiles } from '../lib/common.mjs';

const PORT = 8820;
const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 10, part 2: one directory and one state per environment');

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareWork(import.meta.url);
const envDir = (e) => join(work, 'envs', e);
const T = (e, args) => terra(envDir(e), args, { initArgs: ['-backend-config=backend.hcl'] });
const file = (e) => join(envDir(e), 'main.tf');
const log = [];
let server;

const serverState = (e) => {
  const p = join(server.dir, e, 'app.json');
  if (!existsSync(p)) return null;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { serial: j.serial, resources: (j.resources || []).length };
};
const stripLifecycle = (s) => s.replace(/\n {2}lifecycle \{[\s\S]*?\n {2}\}\n/, '\n');
const stripContainer = (s) => s.replace(/resource "docker_container" "app" \{[\s\S]*?\n\}\n/, '');

try {
  cleanup(N);
  server = await startStateServer({ port: PORT, dir: join(work, '.state'), log: (l) => log.push(l) });
  rec.step(`node toolkit/state-server.mjs --port ${PORT} --dir work/.state   (started from run.mjs, in this process)`, `State server on port ${PORT}.`, 'A tiny server that speaks the http backend protocol, with locking. Teaching only: no encryption.');

  // backend.hcl for each environment: the address of its own state and its own lock.
  const host = hostName();
  for (const e of ['dev', 'prod']) {
    writeFileSync(
      join(envDir(e), 'backend.hcl'),
      `address        = "http://${host}:${PORT}/state/${e}/app"\nlock_address   = "http://${host}:${PORT}/lock/${e}/app"\nunlock_address = "http://${host}:${PORT}/lock/${e}/app"\n`,
    );
  }
  rec.step(
    'cat envs/prod/backend.hcl',
    readFileSync(join(envDir('prod'), 'backend.hcl'), 'utf8').replaceAll(host, '<host>'),
    'The state has a name (prod/app) and a lock has a name. Without lock_address, the http backend does not lock at all. <host> stands for the machine that runs the server.',
  );

  // init and apply both environments
  const inits = {};
  for (const e of ['dev', 'prod']) {
    inits[e] = await initWork(envDir(e), ['-backend-config=backend.hcl']);
    if (inits[e].code !== 0) throw new Error(inits[e].out);
  }
  rec.step(
    'cd envs/prod && terraform init -backend-config=backend.hcl',
    grep(inits.prod.out, /backend|initialized/),
    'Each folder has its own .terraform directory and points at its own state. The same was done in envs/dev.',
  );

  const applyDev = await T('dev', ['apply', '-auto-approve', '-input=false']);
  const applyProd = await T('prod', ['apply', '-auto-approve', '-input=false']);
  rec.step(
    'cd envs/dev && terraform apply -auto-approve\ncd envs/prod && terraform apply -auto-approve',
    `dev:  ${tail(applyDev.out, 3).split('\n').find((l) => /Apply complete/.test(l)) || tail(applyDev.out, 1)}\nprod: ${tail(applyProd.out, 3).split('\n').find((l) => /Apply complete/.test(l)) || tail(applyProd.out, 1)}`,
    'Two applies, two states, one server.',
  );

  // what the server holds
  const stateFiles = listFiles(server.dir);
  const sDev1 = serverState('dev');
  const sProd1 = serverState('prod');
  const names1 = containers();
  rec.step(
    'ls -R work/.state\ndocker ps -a --filter label=tfc.challenge=10 --format {{.Names}}',
    `${stateFiles.join('\n')}\ndev state:  serial ${sDev1?.serial}, ${sDev1?.resources} resources\nprod state: serial ${sProd1?.serial}, ${sProd1?.resources} resources\n${names1.join('\n')}`,
    'One state file per environment on the server, and no terraform.tfstate in either folder. The container names say which environment they belong to.',
  );

  // change dev only
  writeFileSync(file('dev'), readFileSync(file('dev'), 'utf8').replace('GREETING=hello', 'GREETING=hello-dev'));
  const planDev = await T('dev', ['plan', '-input=false']);
  const logFrom = log.length;
  const applyDev2 = await T('dev', ['apply', '-auto-approve', '-input=false']);
  const applyLog = log.slice(logFrom);
  const sDev2 = serverState('dev');
  const sProd2 = serverState('prod');
  const planProd = await T('prod', ['plan', '-input=false']);
  const prodNoChanges = /No changes\./.test(planProd.out);
  rec.step(
    'edit envs/dev/main.tf (GREETING=hello-dev)\ncd envs/dev && terraform apply -auto-approve\ncd envs/prod && terraform plan',
    `${grep(planDev.out, /Plan:/)}\n${tail(applyDev2.out, 3).split('\n').find((l) => /Apply complete/.test(l)) || ''}\ndev state:  serial ${sDev2?.serial}\nprod state: serial ${sProd2?.serial}\nprod plan: ${prodNoChanges ? 'No changes.' : grep(planProd.out, /Plan:/)}`,
    'The dev change moved the dev state forward. The prod state did not move at all. A mistake in this folder cannot reach the other state.',
  );

  rec.step(
    'what the state server logged during that dev apply',
    applyLog.join('\n'),
    'Every run takes the lock first, reads the state, writes the new state and releases the lock. All of it is on the dev name only.',
  );

  // destroy dev: allowed
  const destroyDev = await T('dev', ['destroy', '-auto-approve', '-input=false']);
  rec.step(
    'cd envs/dev && terraform destroy -auto-approve',
    tail(destroyDev.out, 1),
    'Dev is meant to be thrown away, so nothing guards it.',
  );

  // destroy prod: should be refused
  const destroyProd = await T('prod', ['destroy', '-auto-approve', '-input=false']);
  const blocked = destroyProd.code !== 0 && /prevent_destroy/.test(destroyProd.out);
  rec.step(
    'cd envs/prod && terraform destroy -auto-approve',
    blocked ? errorBlock(destroyProd.out, 14) : tail(destroyProd.out, 3),
    blocked
      ? 'prevent_destroy stops the plan before anything is destroyed. Both resources stay.'
      : 'Nothing stopped it. The prod container is gone.',
  );
  const afterDestroy = containers();

  // what removing the guard does
  const original = readFileSync(file('prod'), 'utf8');
  writeFileSync(file('prod'), stripLifecycle(original));
  const planNoGuard = await T('prod', ['plan', '-destroy', '-input=false']);
  const noGuardCounts = planCounts(planNoGuard.out);
  rec.step(
    'delete the lifecycle block from envs/prod/main.tf\ncd envs/prod && terraform plan -destroy',
    grep(planNoGuard.out, /Plan:|Error:|prevent_destroy/) || tail(planNoGuard.out, 2),
    'Delete the block, and the same destroy is planned without any complaint. The guard is part of the code, so it is only as safe as your code review.',
  );

  writeFileSync(file('prod'), stripContainer(original));
  const planGone = await T('prod', ['plan', '-input=false']);
  const goneCounts = planCounts(planGone.out);
  rec.step(
    'delete the whole docker_container block from envs/prod/main.tf\ncd envs/prod && terraform plan',
    grep(planGone.out, /# docker_container|because|Plan:|Error:/),
    'Delete the resource and its lifecycle rule goes with it. Terraform plans the destroy, because the rule can only guard resources that are still in the code.',
  );
  writeFileSync(file('prod'), original);

  // clean up prod for real
  writeFileSync(file('prod'), stripLifecycle(original));
  const destroyProd2 = await T('prod', ['destroy', '-auto-approve', '-input=false']);
  writeFileSync(file('prod'), original);
  const sFinal = serverState('prod');
  rec.step(
    'remove the lifecycle block again, then cd envs/prod && terraform destroy -auto-approve',
    `${tail(destroyProd2.out, 1)}\nprod state on the server: serial ${sFinal?.serial}, ${sFinal?.resources} resources`,
    'This is how the part cleans up. In real life you would stop and ask who removed the guard, and why.',
  );

  const events = server.events;
  const count = (m) => events.filter((x) => x.method === m).length;
  setFact('c10.p2.state_files_count', stateFiles.filter((f) => f.endsWith('.json')).length);
  setFact('c10.p2.containers_count', names1.length);
  setFact('c10.p2.local_tfstate_files_count', ['dev', 'prod'].filter((e) => existsSync(join(envDir(e), 'terraform.tfstate'))).length);
  setFact('c10.p2.dev_serial_before_change', sDev1?.serial ?? -1);
  setFact('c10.p2.dev_serial_after_change', sDev2?.serial ?? -1);
  setFact('c10.p2.prod_serial_unchanged', !!sProd1 && !!sProd2 && sProd1.serial === sProd2.serial);
  setFact('c10.p2.prod_plan_no_changes', prodNoChanges);
  setFact('c10.p2.destroy_dev_ok', destroyDev.code === 0);
  setFact('c10.p2.destroy_prod_blocked', blocked);
  setFact('c10.p2.destroy_prod_error_text', blocked ? (destroyProd.out.match(/Error: [^\n]*/) || [''])[0].replace(/^Error: /, '') : 'not blocked');
  setFact('c10.p2.prod_containers_after_blocked_destroy_count', afterDestroy.filter((n) => n.includes('prod')).length);
  setFact('c10.p2.no_guard_destroy_count', noGuardCounts ? noGuardCounts.destroy : 0);
  setFact('c10.p2.resource_removed_destroy_count', goneCounts ? goneCounts.destroy : 0);
  setFact('c10.p2.lock_requests_count', count('LOCK'));
  setFact('c10.p2.unlock_requests_count', count('UNLOCK'));
  setFact('c10.p2.lock_denied_count', events.filter((x) => x.method === 'LOCK' && x.code === 423).length);

  await server.close();
  server = null;
  const left = leftovers(N);
  setFact('c10.p2.leftover_count', left.containers + left.networks + left.volumes);
  rec.step(
    `docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=${N})`,
    `${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes`,
    'The server is stopped and everything this part built is gone.',
  );

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, ${versionLine()} (${mode()} mode), Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c10.p2');
} catch (e) {
  console.error(`\nStopped: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  if (server) await server.close();
  cleanup(N);
}
