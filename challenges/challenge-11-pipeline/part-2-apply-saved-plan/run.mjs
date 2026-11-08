// Challenge 11, part 2: apply the saved plan, and only the saved plan.
// Run: node challenges/challenge-11-pipeline/part-2-apply-saved-plan/run.mjs
// Add --record to also write results.md next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the solution instead of your files.
//
// It runs your three pipeline steps (ci/plan.mjs, ci/gate.mjs, ci/apply.mjs) in four situations:
//   A  a plan that only adds something: the gate should pass
//   B  the code changes after the plan was reviewed, before the apply step: the apply must not take the new change
//   C  the state changes after the plan was made: the apply must refuse the old plan
//   D  a plan that destroys the data volume: the gate must stop the pipeline before the apply step

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, leftovers, assertDocker, run as docker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { planCounts, versionLine, mode } from '../../../toolkit/tf.js';
import { N, terra, initWork, tail, head, runNodeRetry as runNode, containerId, containerEnv, read } from '../lib/common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 11, part 2: apply the saved plan');
const DB = 'tfc-c11-p2-db';
const DATA = 'tfc-c11-p2-data';

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareWork(import.meta.url);
const infra = join(work, 'infra');
const mainTf = join(infra, 'main.tf');
const ci = (f) => join(work, 'ci', f);
const original = readFileSync(mainTf, 'utf8');
const stable = (t) => t.replace(/\(\d+(\.\d+)?s\)/g, '(Ns)');
const planStep = () => runNode([ci('plan.mjs'), infra], { cwd: work });
const gateStep = () => runNode([ci('gate.mjs'), join(infra, 'plan.json')], { cwd: work });
const applyStep = (file = 'plan.tfplan') => runNode([ci('apply.mjs'), infra, file], { cwd: work });
const volumeExists = (name) => docker(['volume', 'inspect', name]).code === 0;
const withCache = `${original}
resource "docker_volume" "cache" {
  name = "tfc-c11-p2-cache"

  labels {
    label = "tfc.challenge"
    value = "11"
  }
}
`;
const applied = (t) => /Apply complete! Resources: (\d+) added, (\d+) changed, (\d+) destroyed/.exec(t);

try {
  cleanup(N);
  const init0 = await initWork(infra);
  if (init0.code !== 0) throw new Error(init0.out);
  const base = await terra(infra, ['apply', '-auto-approve', '-input=false']);
  const id0 = containerId(DB);
  rec.step('cd infra && terraform apply -auto-approve', tail(base.out, 1), 'The starting point: an image resource, a data volume and the database container, built with db_mode = "standard".');

  // A: a plan that only adds
  writeFileSync(mainTf, withCache);
  const pA = await planStep();
  const gA = await gateStep();
  rec.step(
    'node ci/plan.mjs infra\nnode ci/gate.mjs infra/plan.json',
    `${stable(pA.out)}\n${gA.out.trim()}\n(exit code of the gate: ${gA.code})`,
    'The pull request adds one volume. The plan is saved as plan.tfplan and a person reviews it. The gate passes because nothing is destroyed.',
  );

  // B: the code changes between review and apply
  writeFileSync(mainTf, withCache.replace('default = "standard"', 'default = "fast"'));
  const aB = await applyStep();
  const idB = containerId(DB);
  const envB = containerEnv(DB, 'DB_MODE=') || [];
  const unreviewedApplied = idB !== id0 || envB.includes('DB_MODE=fast');
  const rB = applied(aB.out);
  const pendingB = await terra(infra, ['plan', '-input=false']);
  const pendingCounts = planCounts(pendingB.out);
  rec.step(
    'someone merges db_mode = "fast" into the code after the review\nnode ci/apply.mjs infra plan.tfplan\ndocker inspect (DB_MODE of the container)\ncd infra && terraform plan',
    `${stable(aB.out).trim()}\n${DB}: ${envB.join(' ') || '(missing)'}  (same container as before: ${idB === id0})\nplan afterwards: ${pendingCounts ? `Plan: ${pendingCounts.add} to add, ${pendingCounts.change} to change, ${pendingCounts.destroy} to destroy.` : 'No changes.'}`,
    unreviewedApplied
      ? 'The apply step planned again and applied a change nobody reviewed. The container was destroyed and rebuilt.'
      : 'The apply step used the reviewed plan file. The new change was not part of it, so the container is untouched, and the next plan still shows the change that waits for its own review.',
  );

  // C: the state changes between plan and apply
  const pC = await planStep();
  const other = await terra(infra, ['apply', '-auto-approve', '-input=false', '-var', 'db_mode=other']);
  const aC = await applyStep();
  const stale = aC.code !== 0 && /stale/i.test(aC.out);
  rec.step(
    'node ci/plan.mjs infra\nsomeone else runs: terraform apply -auto-approve -var db_mode=other\nnode ci/apply.mjs infra plan.tfplan',
    `${stable(pC.out).split('\n').filter((l) => /Plan:|No changes/.test(l)).join('\n')}\n${tail(other.out, 1)}\n${stable(aC.out).trim()}\n(exit code of the apply step: ${aC.code})`,
    stale
      ? 'The plan was made against an older state. Terraform refuses it, and changes nothing. The pipeline must plan again and get a new review.'
      : 'The apply step did not notice that the state moved: it planned again and applied. Nothing protected the reviewed plan.',
  );

  // D: a plan that destroys the data volume
  const idBeforeD = containerId(DB);
  writeFileSync(mainTf, withCache.replace('name = "tfc-c11-p2-data"', 'name = "tfc-c11-p2-data-v2"'));
  const pD = await planStep();
  const gD = await gateStep();
  let aD = null;
  if (gD.code === 0) aD = await applyStep();
  const idAfterD = containerId(DB);
  const dataSurvives = volumeExists(DATA);
  const blockedLines = gD.out.split('\n').filter((l) => /^\s+(replace|delete): /.test(l));
  rec.step(
    'edit infra/main.tf: rename the data volume\nnode ci/plan.mjs infra\nnode ci/gate.mjs infra/plan.json\nnode ci/apply.mjs infra plan.tfplan   (only if the gate passed)',
    `${stable(pD.out).split('\n').filter((l) => /Plan:|No changes/.test(l)).join('\n')}\n${gD.out.trim()}\n(exit code of the gate: ${gD.code})\n${aD ? `apply step ran: ${stable(aD.out).trim()}` : 'apply step: skipped'}\n${DATA} still exists: ${dataSurvives}`,
    gD.code !== 0
      ? 'The gate fails the pipeline, so the apply step never runs. The volume and its data are untouched. A person has to decide what happens next.'
      : 'The gate passed a plan that destroys the data volume. The apply step ran. The volume (and what was in it) is gone.',
  );

  // clean up
  writeFileSync(mainTf, withCache);
  const destroy = await terra(infra, ['destroy', '-auto-approve', '-input=false']);
  rec.step('cd infra && terraform destroy -auto-approve', tail(destroy.out, 1), 'Everything this part built is removed.');

  // facts
  setFact('c11.p2.gate_clean_exit_code', gA.code);
  setFact('c11.p2.reviewed_apply_added_count', rB ? +rB[1] : -1);
  setFact('c11.p2.reviewed_apply_destroyed_count', rB ? +rB[3] : -1);
  setFact('c11.p2.unreviewed_change_applied', unreviewedApplied);
  setFact('c11.p2.pending_destroy_after_apply_count', pendingCounts ? pendingCounts.destroy : 0);
  setFact('c11.p2.stale_plan_refused', stale);
  setFact('c11.p2.stale_exit_code', aC.code);
  setFact('c11.p2.stale_error_text', stale ? (aC.out.match(/Error: [^\n]*/) || [''])[0].replace(/^Error: /, '') : 'not refused');
  setFact('c11.p2.gate_destroy_exit_code', gD.code);
  setFact('c11.p2.gate_destroy_lines_count', blockedLines.length);
  setFact('c11.p2.apply_skipped_after_gate', gD.code !== 0 && aD === null && idAfterD === idBeforeD && dataSurvives);
  const left0 = leftovers(N);
  setFact('c11.p2.leftover_count', left0.containers + left0.networks + left0.volumes);
  rec.step(
    `docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=${N})`,
    `${left0.containers} containers, ${left0.networks} networks, ${left0.volumes} volumes`,
    'Everything this part built is gone.',
  );

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, ${versionLine()} (${mode()} mode), Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c11.p2');
} catch (e) {
  console.error(`\nStopped: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  if (existsSync(mainTf)) writeFileSync(mainTf, original);
  cleanup(N);
}
