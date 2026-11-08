// Challenge 10, part 1: workspaces on local state.
// Run: node challenges/challenge-10-environments/part-1-workspaces/run.mjs
// Add --record to also write results.md next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the solution instead of your files.
//
// It makes two workspaces (dev and prod) from one configuration, shows where each state lives, makes the classic
// mistake (a change meant for dev applied while the prod workspace is selected), tries the "default" workspace,
// and tries to delete a workspace that still has things in it. At the end it destroys everything it made.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, leftovers, assertDocker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { planCounts, applyCounts, versionLine, mode } from '../../../toolkit/tf.js';
import { N, terra, initWork, tail, head, grep, errorBlock, containers, containerEnv, listFiles } from '../lib/common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 10, part 1: workspaces on local state');
const dev = 'tfc-c10-p1-dev-app';
const prod = 'tfc-c10-p1-prod-app';

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });

try {
  cleanup(N);

  // 1. init
  const init = await initWork(work);
  if (init.code !== 0) throw new Error(init.out);
  rec.step('terraform init', tail(init.out, 1), 'One configuration, one set of providers. Workspaces do not change this part.');

  // 2. the workspace you start in
  const list0 = await terra(work, ['workspace', 'list']);
  rec.step('terraform workspace list', list0.out.trim(), 'Every folder starts with one workspace, called default. You never created it.');

  // 3. dev
  const newDev = await terra(work, ['workspace', 'new', 'dev']);
  const applyDev = await terra(work, ['apply', '-auto-approve', '-input=false']);
  rec.step(
    'terraform workspace new dev\nterraform apply -auto-approve',
    `${head(newDev.out, 1)}\n${tail(applyDev.out, 5)}`,
    'The new workspace starts empty. The apply builds one image resource and one container, and the output says which workspace did it.',
  );

  // 4. prod
  const newProd = await terra(work, ['workspace', 'new', 'prod']);
  const applyProd = await terra(work, ['apply', '-auto-approve', '-input=false']);
  const prodOk = applyProd.code === 0;
  rec.step(
    'terraform workspace new prod\nterraform apply -auto-approve',
    prodOk ? `${head(newProd.out, 1)}\n${tail(applyProd.out, 5)}` : `${head(newProd.out, 1)}\n${errorBlock(applyProd.out, 6)}`,
    prodOk
      ? 'Same files, a second empty state. Creating the workspace also selected it: you are now in prod.'
      : 'Two workspaces gave two empty states, but both states want the same container name, and Docker allows each name only once.',
  );

  // 5. where state lives
  const wsList = await terra(work, ['workspace', 'list']);
  const stateFiles = existsSync(join(work, 'terraform.tfstate.d')) ? listFiles(join(work, 'terraform.tfstate.d')) : [];
  const stateFilesOnly = stateFiles.filter((f) => f.endsWith('terraform.tfstate'));
  rec.step(
    'terraform workspace list\nls -R terraform.tfstate.d',
    `${wsList.out.trim()}\n\n${stateFiles.map((f) => `terraform.tfstate.d/${f}`).join('\n')}`,
    'Local state keeps one file per workspace, in a folder next to your code. The default workspace uses terraform.tfstate in the folder itself. Nothing here is shared, and nobody else is locked out.',
  );

  // 6. what is running
  const names1 = containers();
  rec.step(
    'docker ps -a --filter label=tfc.challenge=10 --format {{.Names}}',
    names1.join('\n') || '(none)',
    `The names show the workspace only if the configuration puts terraform.workspace in the name. Containers: ${names1.length}.`,
  );

  // 7. the classic mistake: a change for dev, applied in the prod workspace
  const show1 = await terra(work, ['workspace', 'show']);
  const planWrong = await terra(work, ['plan', '-input=false', '-var', 'greeting=hello-dev']);
  const countsWrong = planCounts(planWrong.out);
  rec.step(
    'terraform workspace show\nterraform plan -var greeting=hello-dev',
    `${show1.out.trim()}\n${grep(planWrong.out, /# docker_container|must be replaced|forces replacement|GREETING|Plan:|Error:/)}`,
    countsWrong && countsWrong.destroy === 1
      ? 'You meant to try the new greeting in dev. The shell is still in prod, because "workspace new prod" selected it. The plan wants to destroy and rebuild the prod container.'
      : 'The prod workspace has no container in this run, so there is nothing to rebuild. Fix the container name first, then run again.',
  );
  const applyWrong = await terra(work, ['apply', '-auto-approve', '-input=false', '-var', 'greeting=hello-dev']);
  const devEnv = containerEnv(dev);
  const prodEnv = containerEnv(prod);
  const devUnchanged = !!devEnv && devEnv.includes('GREETING=hello');
  const prodChanged = !!prodEnv && prodEnv.includes('GREETING=hello-dev');
  rec.step(
    'terraform apply -auto-approve -var greeting=hello-dev\ndocker inspect (GREETING of each container)',
    `${grep(applyWrong.out, /Apply complete/)}\n${dev}: ${devEnv ? devEnv.join(' ') : '(missing)'}\n${prod}: ${prodEnv ? prodEnv.join(' ') : '(missing)'}`,
    prodChanged && devUnchanged
      ? 'Prod changed and dev did not. Nothing stopped this: the apply asked no question beyond the flag you gave it.'
      : 'There is no prod container and no dev container to compare, so this step proves nothing yet.',
  );

  // 8. the default workspace
  const selDefault = await terra(work, ['workspace', 'select', 'default']);
  const planDefault = await terra(work, ['plan', '-input=false']);
  const defaultBlocked = planDefault.code !== 0 && /precondition failed/i.test(planDefault.out);
  rec.step(
    'terraform workspace select default\nterraform plan',
    `${head(selDefault.out, 1)}\n${planDefault.code === 0 ? grep(planDefault.out, /# docker_container|Plan:/) : errorBlock(planDefault.out, 8)}`,
    defaultBlocked
      ? 'A precondition on the container refuses any workspace that is not dev or prod. The default workspace cannot be applied by accident.'
      : 'The plan accepts the default workspace and would build a container for it. Nothing marks it as the wrong place.',
  );

  // 9. delete a workspace that still has things in it
  const delDev = await terra(work, ['workspace', 'delete', 'dev']);
  const deleteBlocked = delDev.code !== 0 && /is not empty/.test(delDev.out);
  rec.step(
    'terraform workspace delete dev',
    errorBlock(delDev.out, 14),
    'Terraform refuses to forget a workspace that still tracks objects. Deleting the state would orphan the container.',
  );

  // 10. clean up the right way: destroy inside each workspace, then delete it
  const gone = [];
  for (const ws of ['dev', 'prod']) {
    await terra(work, ['workspace', 'select', ws]);
    const d = await terra(work, ['destroy', '-auto-approve', '-input=false']);
    await terra(work, ['workspace', 'select', 'default']);
    const del = await terra(work, ['workspace', 'delete', ws]);
    gone.push(`${ws}: ${tail(d.out, 1)} | ${tail(del.out, 1)}`);
  }
  const finalList = await terra(work, ['workspace', 'list']);
  rec.step(
    'for each of dev and prod: terraform workspace select <it>, terraform destroy -auto-approve,\nthen terraform workspace select default and terraform workspace delete <it>',
    `${gone.join('\n')}\n${finalList.out.trim()}`,
    'The safe order is select, destroy, switch away, delete. Only then does the workspace disappear.',
  );

  // facts
  setFact('c10.p1.workspaces_count', wsList.out.split('\n').filter((l) => l.trim()).length);
  setFact('c10.p1.state_files_count', stateFilesOnly.length);
  setFact('c10.p1.containers_count', names1.length);
  setFact('c10.p1.wrong_env_destroy_count', countsWrong ? countsWrong.destroy : 0);
  setFact('c10.p1.wrong_env_add_count', countsWrong ? countsWrong.add : 0);
  setFact('c10.p1.prod_changed', prodChanged);
  setFact('c10.p1.dev_unchanged', devUnchanged);
  setFact('c10.p1.default_blocked', defaultBlocked);
  setFact('c10.p1.delete_nonempty_blocked', deleteBlocked);
  setFact('c10.p1.delete_nonempty_text', deleteBlocked ? errorBlock(delDev.out, 1).replace(/^Error: /, '') : 'not blocked');
  setFact('c10.p1.default_precondition_text', defaultBlocked ? (planDefault.out.match(/The workspace "default" is not allowed[^\n]*/) || [''])[0] : 'not blocked');
  setFact('c10.p1.apply_prod_ok', prodOk);
  setFact('c10.p1.apply_dev_added_count', applyCounts(applyDev.out)?.added ?? 0);

  const left = leftovers(N);
  setFact('c10.p1.leftover_count', left.containers + left.networks + left.volumes);
  rec.step(
    `docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=${N})`,
    `${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes`,
    'Everything this part built is gone.',
  );

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, ${versionLine()} (${mode()} mode), Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c10.p1');
} catch (e) {
  console.error(`\nStopped: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  cleanup(N);
}
