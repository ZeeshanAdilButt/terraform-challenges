// Challenge 14, part 2: ship it through a pipeline.
// Run: node challenges/challenge-14-capstone/part-2-ship-it-through-a-pipeline/run.mjs
// Add --record to also write results.md and chart.svg. Add --reference (or TFC_REFERENCE=1) to run the solution.
//
// GitHub runs your workflow. This script cannot do that, so it runs the same steps on your machine: the commands of
// capstone/ci/pipeline.mjs, which your workflow calls too, in the order the workflow calls them.
//   1. reads .github/workflows/terraform.yml and checks every `uses:` against GitHub (gh api), when gh is installed,
//   2. plan and apply dev and prod, each step as its own process, with the state on a state server (port 8851),
//   3. a harmless change goes through, a change that replaces the protected cache is blocked by your plan gate,
//      a change to the data volume is stopped by prevent_destroy, and a saved plan goes stale,
//   4. runs plan and apply as two separate "jobs" with a fresh state server each, the way two GitHub runners would.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDocker, cleanup, leftovers } from '../../../toolkit/docker.js';
import { Recorder } from '../../../toolkit/record.js';
import { recording, useReference } from '../../../toolkit/part.js';
import { startStateServer } from '../../../toolkit/state-server.mjs';
import { barsSvg } from '../../../toolkit/bars.js';
import { versionLine, mode } from '../../../toolkit/tf.js';
import { N, containerId, envRunner, first, grep, prepareCapstone, runNode, saveFacts, short, tail, stable } from '../lib.mjs';
import { failing, gateChecks, usesOf, workflowChecks } from '../shape.mjs';

const PORT = 8851;
const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 14, part 2: ship it through a pipeline');

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareCapstone(import.meta.url, 2);
const cap = join(work, 'capstone');
const base = `http://127.0.0.1:${PORT}`;
const tokens = { dev: randomBytes(6).toString('hex'), prod: randomBytes(6).toString('hex') };
const prodMain = join(cap, 'envs', 'prod', 'main.tf');
const pipeline = join(cap, 'ci', 'pipeline.mjs');

const facts = {
  uses_count: 0,
  uses_pinned_count: 0,
  pins_verified_count: -1,
  pins_wrong_count: 0,
  workflow_failing_count: -1,
  gate_failing_count: -1,
  check_dev_exit_code: -1,
  check_prod_exit_code: -1,
  baseline_dev_plan_add_count: 0,
  baseline_prod_plan_add_count: 0,
  baseline_gate_exit_code: -1,
  baseline_apply_ok: false,
  harmless_plan_change_count: -1,
  harmless_plan_destroy_count: -1,
  harmless_gate_exit_code: -1,
  harmless_apply_ok: false,
  harmless_second_plan_no_changes: false,
  protected_plan_destroy_count: -1,
  protected_gate_exit_code: -1,
  protected_gate_line: '',
  protected_cache_container_kept: false,
  volume_plan_exit_code: -1,
  volume_plan_error: '',
  stale_apply_exit_code: -1,
  stale_apply_error: '',
  two_jobs_plan_exit_code: -1,
  two_jobs_apply_exit_code: -1,
  two_jobs_apply_added_count: 0,
  leftover_count: -1,
};
const save = () => saveFacts('c14.p2', facts);
const stopHere = (why) => {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
};

let server;
const stateDir = (name) => join(work, name);
const startServer = async (name) => {
  server = await startStateServer({ port: PORT, dir: stateDir(name), tokens, log: () => {} });
};
const stopServer = async () => {
  if (server) await server.close();
  server = null;
};
/** One step of the pipeline as its own process, with the credentials of that environment, like a job on a runner. */
const step = (s, env) => runNode([pipeline, s, env], { cwd: cap, env: { TFC_STATE_URL: base, TF_HTTP_USERNAME: 'tf', TF_HTTP_PASSWORD: tokens[env] } });
const runner = (env) => envRunner({ work, env, base, token: tokens[env] });
const noTime = (t) => stable(t).split('\n').filter((l) => !/^Wrote /.test(l)).join('\n').trim();
const mainOriginal = readFileSync(prodMain, 'utf8');
const setProd = (text) => writeFileSync(prodMain, text);

/** Ask GitHub which commit a tag points to. null when gh is not installed or not signed in. */
function lookup(action, tag) {
  const r = spawnSync('gh', ['api', `repos/${action}/commits/${tag}`, '-q', '.sha'], { encoding: 'utf8', timeout: 30_000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

async function main() {
  // 1. The workflow file.
  const text = readFileSync(join(work, '.github', 'workflows', 'terraform.yml'), 'utf8');
  const body = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const uses = usesOf(body);
  const unique = [...new Map(uses.map((u) => [`${u.action}@${u.ref}`, u])).values()];
  facts.uses_count = unique.length;
  facts.uses_pinned_count = unique.filter((u) => /^[0-9a-f]{40}$/.test(u.ref)).length;
  const verdicts = unique.map((u) => {
    const tag = u.comment.split(/\s+/)[0];
    const pinned = /^[0-9a-f]{40}$/.test(u.ref);
    const sha = pinned && tag ? lookup(u.action, tag) : null;
    return { u, tag, pinned, sha, ok: sha === null ? null : sha === u.ref };
  });
  const checked = verdicts.filter((v) => v.ok !== null);
  facts.pins_verified_count = checked.length ? checked.filter((v) => v.ok).length : -1;
  facts.pins_wrong_count = checked.filter((v) => !v.ok).length;
  const wf = failing(workflowChecks(work));
  const gt = failing(gateChecks(work));
  facts.workflow_failing_count = wf.length;
  facts.gate_failing_count = gt.length;
  rec.step(
    'gh api repos/<owner>/<repo>/commits/<tag> -q .sha   (for every uses: line of .github/workflows/terraform.yml)',
    short(verdicts.map((v) => `${v.u.action}@${v.u.ref.slice(0, 12)}${v.u.ref.length > 12 ? '...' : ''}  # ${v.tag || '(no tag comment)'}  ${!v.pinned ? 'NOT PINNED' : v.ok === null ? 'not checked (no gh, or no tag comment)' : v.ok ? 'verified: the tag points to this commit' : `WRONG: the tag points to ${v.sha.slice(0, 12)}`}`).join('\n') || '(no uses: lines)'),
    'A tag can be moved to other code. A full commit SHA cannot. The comment keeps the version readable, and gh api proves that the comment and the SHA agree.',
  );
  if (wf.length || gt.length) {
    save();
    return stopHere(`${wf.length + gt.length} parts of the pipeline are still missing. Run the test (node --test challenges/challenge-14-capstone/part-2-ship-it-through-a-pipeline/test.mjs) to see which.`);
  }

  await startServer('state-a');
  rec.step(`node toolkit/state-server.mjs --port ${PORT}   (started from run.mjs, a token for dev and one for prod)`, `State server on port ${PORT}.`, 'The state lives outside every step, like a real backend: each step below is a separate process and finds the state where the last one left it.');

  // 2. The checks, then plan and apply of both environments.
  const cd = await step('check', 'dev');
  const cp = await step('check', 'prod');
  facts.check_dev_exit_code = cd.code;
  facts.check_prod_exit_code = cp.code;
  rec.step('node capstone/ci/pipeline.mjs check dev\nnode capstone/ci/pipeline.mjs check prod', `${noTime(cd.out)}\n${noTime(cp.out)}`, 'The cheap checks first: format, init without a backend, validate. No state is read and nothing is planned.');
  if (cd.code !== 0 || cp.code !== 0) return stopHere('a check failed. The output above names the step.');

  const pDev = await step('plan', 'dev');
  const pProd = await step('plan', 'prod');
  facts.baseline_dev_plan_add_count = Number(/Plan: (\d+) to add/.exec(pDev.out)?.[1] ?? 0);
  facts.baseline_prod_plan_add_count = Number(/Plan: (\d+) to add/.exec(pProd.out)?.[1] ?? 0);
  facts.baseline_gate_exit_code = Math.max(pDev.code, pProd.code);
  rec.step('node capstone/ci/pipeline.mjs plan dev\nnode capstone/ci/pipeline.mjs plan prod', `${noTime(pDev.out)}\n${noTime(pProd.out)}`, 'The plan step saves the plan to a file, turns it into JSON and hands the JSON to your gate. Creating things is allowed: the gate only looks at what a plan removes.');
  if (pDev.code !== 0 || pProd.code !== 0) return stopHere('a plan step failed. The output above names the problem.');
  const aDev = await step('apply', 'dev');
  const aProd = await step('apply', 'prod');
  facts.baseline_apply_ok = aDev.code === 0 && aProd.code === 0;
  rec.step('node capstone/ci/pipeline.mjs apply dev\nnode capstone/ci/pipeline.mjs apply prod', `${noTime(aDev.out)}\n${noTime(aProd.out)}`, 'The apply step applies the saved plan file and nothing else. It does not plan again.');
  if (!facts.baseline_apply_ok) return stopHere('an apply step failed. The output above names the problem.');

  // 3a. A harmless change: the memory limit of the prod web container.
  setProd(mainOriginal.replace(/(variable "memory_mb"[\s\S]*?default\s*=\s*)\d+/, '$196'));
  const hPlan = await step('plan', 'prod');
  const hc = /Plan: (\d+) to add, (\d+) to change, (\d+) to destroy/.exec(hPlan.out);
  facts.harmless_plan_change_count = hc ? +hc[1] + +hc[2] + +hc[3] : -1;
  facts.harmless_plan_destroy_count = hc ? +hc[3] : -1;
  facts.harmless_gate_exit_code = hPlan.code;
  const hApply = hPlan.code === 0 ? await step('apply', 'prod') : { code: 1, out: '(not run: the plan step failed)' };
  facts.harmless_apply_ok = hApply.code === 0;
  const hAfter = await runner('prod').run(['plan', '-input=false', '-detailed-exitcode']);
  facts.harmless_second_plan_no_changes = hAfter.code === 0 && /No changes/.test(hAfter.out);
  rec.step(
    'edit capstone/envs/prod/main.tf (memory_mb 128 to 96)\nnode capstone/ci/pipeline.mjs plan prod\nnode capstone/ci/pipeline.mjs apply prod',
    `${noTime(hPlan.out)}\n${noTime(hApply.out)}\nplan afterwards: ${first(hAfter.out, /No changes|^Plan:/)}`,
    'A one-line pull request, a one-line plan: an in-place update of the web container. The gate passes it and the saved plan is applied.',
  );

  // 3b. A dangerous change: a new cache image replaces the protected cache container.
  const cacheBefore = containerId('tfc-c14-prod-cache');
  setProd(mainOriginal.replaceAll('valkey/valkey:8-alpine', 'valkey/valkey:8.0-alpine'));
  const bPlan = await step('plan', 'prod');
  const bc = /Plan: (\d+) to add, (\d+) to change, (\d+) to destroy/.exec(bPlan.out);
  facts.protected_plan_destroy_count = bc ? +bc[3] : -1;
  facts.protected_gate_exit_code = bPlan.code;
  facts.protected_gate_line = first(bPlan.out, /^BLOCKED/);
  facts.protected_cache_container_kept = containerId('tfc-c14-prod-cache') === cacheBefore && cacheBefore !== '';
  rec.step(
    'edit capstone/envs/prod/main.tf (cache_image valkey/valkey:8-alpine to valkey/valkey:8.0-alpine)\nnode capstone/ci/pipeline.mjs plan prod\n(exit code: the job fails, so the apply job never starts)',
    `${noTime(bPlan.out)}\n(exit code ${bPlan.code})\ncache container id unchanged: ${facts.protected_cache_container_kept}`,
    bPlan.code === 1 ? 'The pull request changes one line: a new image tag. The plan would destroy and rebuild the cache container. Your gate reads the plan, sees the label tfc.protected = true on the container that exists now, and fails the job. The apply job needs the plan job, so it is skipped.' : 'The gate let a replacement of the protected cache container through. Fix plan-gate.mjs.',
  );

  // 3c. A change to the data volume: prevent_destroy stops it in the plan step, before the gate has anything to read.
  setProd(mainOriginal.replace(/tfc-c14-prod-cache-data/g, 'tfc-c14-prod-cache-data-v2'));
  const vPlan = await step('plan', 'prod');
  facts.volume_plan_exit_code = vPlan.code;
  facts.volume_plan_error = first(vPlan.out, /^Error/).replace(/^Error: /, '');
  rec.step('edit capstone/envs/prod/main.tf (rename the data volume)\nnode capstone/ci/pipeline.mjs plan prod', short(noTime(vPlan.out), 14), 'A second guard, in a different place. prevent_destroy makes the plan itself fail, so the pipeline stops at the plan step. The gate guards what the plan allows; prevent_destroy guards what Terraform allows. Use both.');

  // 3d. A saved plan goes stale.
  setProd(mainOriginal.replace(/(variable "memory_mb"[\s\S]*?default\s*=\s*)\d+/, '$1112'));
  const sPlan = await step('plan', 'prod');
  setProd(mainOriginal.replace(/(variable "memory_mb"[\s\S]*?default\s*=\s*)\d+/, '$1100'));
  const sOther = await runner('prod').run(['apply', '-auto-approve', '-input=false']);
  setProd(mainOriginal.replace(/(variable "memory_mb"[\s\S]*?default\s*=\s*)\d+/, '$1112'));
  const sApply = await step('apply', 'prod');
  facts.stale_apply_exit_code = sApply.code;
  facts.stale_apply_error = first(sApply.out, /^Error/).replace(/^Error: /, '');
  rec.step(
    'node capstone/ci/pipeline.mjs plan prod   (memory 112)\nsomeone else applies a different change (memory 100) by hand\nnode capstone/ci/pipeline.mjs apply prod',
    short(`${grep(sPlan.out, /^Plan:/)}\n${grep(sOther.out, /^Apply complete/)}\n${noTime(sApply.out)}`, 14),
    sApply.code !== 0 ? 'The saved plan was made against an older state. Terraform refuses it and changes nothing. The pipeline must plan again and get a new review. This is why the apply job applies a file and never plans on its own.' : 'The apply went through on a stale plan.',
  );
  setProd(mainOriginal);

  // 4. Two jobs on two runners: dev is removed, then planned on one fresh state server and applied on another.
  const dd = await runner('dev').run(['destroy', '-auto-approve', '-input=false']);
  await stopServer();
  await startServer('state-b');
  const jPlan = await step('plan', 'dev');
  await stopServer();
  await startServer('state-c');
  const jApply = await step('apply', 'dev');
  facts.two_jobs_plan_exit_code = jPlan.code;
  facts.two_jobs_apply_exit_code = jApply.code;
  facts.two_jobs_apply_added_count = Number(/Apply complete! Resources: (\d+) added/.exec(jApply.out)?.[1] ?? 0);
  rec.step(
    'terraform destroy (dev, by hand)\nstate server A stops. State server B starts empty.  node capstone/ci/pipeline.mjs plan dev\nstate server B stops. State server C starts empty.  node capstone/ci/pipeline.mjs apply dev',
    `${tail(dd.out, 1)}\n${noTime(jPlan.out)}\n${noTime(jApply.out)}`,
    jApply.code === 0 ? 'This is what the two jobs of your workflow do: each runs on a fresh machine with a fresh teaching state server, and the plan saved by the first applies on the second because both states are empty. A real pipeline uses a backend that outlives the job.' : 'The plan of the first job did not apply on the second.',
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
  await stopServer();
  cleanup(N);
  try {
    setProd(mainOriginal);
  } catch { /* work folder gone */ }
  const left = leftovers(N);
  facts.leftover_count = left.containers + left.networks + left.volumes;
  save();
  rec.step(`docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=${N})`, `${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes`, 'Everything this part built is gone (cleanup by label). The images stay on your machine (keep_locally).');
  if (recording() && useReference() && facts.two_jobs_apply_exit_code === 0) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, ${versionLine()} (${mode()} mode), Node ${process.versions.node}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Resources each prod pull request would destroy, and whether the pipeline let it through',
        unit: 'destroyed',
        bars: [
          { label: 'memory 128 to 96 (passes)', value: facts.harmless_plan_destroy_count },
          { label: 'new cache image (blocked)', value: facts.protected_plan_destroy_count },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c14.p2');
}
