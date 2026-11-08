// Challenge 7, part 1: build a module and call it for two environments.
// Run: node challenges/challenge-7-a-module/part-1-build-and-call/run.mjs
// Add --record to also write results.md. Use --reference (or TFC_REFERENCE=1) to run the solution instead of your files.
//
// It copies your files to work/, then: init, plan, apply, read the module outputs, try two bad inputs,
// plan again and destroy. When a step fails (the starter fails on purpose) it records the failure,
// cleans up and stops, so you see one problem at a time.

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, leftovers } from '../../../toolkit/docker.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { applyCounts, planCounts, mode } from '../../../toolkit/tf.js';
import { N, init, run, short, grep, firstMatch, from, errorBlock, parse , saveFacts } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 7, part 1: build a module and call it for two environments');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });

// Every fact starts at its "not done" value, so a stopped run never leaves numbers from an older run behind.
const facts = {
  init_ok: false,
  plan_add_count: 0,
  apply_ok: false,
  apply_added_count: 0,
  module_instances_count: 0,
  output_keys_count: 0,
  output_leaks_token: true,
  environment_validation_rejects: false,
  memory_validation_rejects: false,
  second_plan_changes_count: -1,
  destroyed_count: 0,
  leftover_count: -1,
};
const save = () => saveFacts("c7.p1", facts);
const stopHere = (why) => {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
};

const ok = (r) => r.code === 0;
const keep = (text, re, max = 25) => short(grep(text, re).join('\n'), max);
const noId = (l) => l.replace(/\[id=[0-9a-f]{12}[0-9a-f]*\]/, '[id=...]');

async function main() {
  // 1. init
  const i = await init(work);
  rec.step(
    'terraform init',
    ok(i) ? keep(i.out, /^Initializing modules|^- (app|Install)|^Terraform has been/) : errorBlock(i.out),
    ok(i) ? 'init installs the module (a local folder, so nothing is downloaded for it) and the Docker provider.' : 'init failed. Read the error: it says what the module is missing.',
  );
  facts.init_ok = ok(i);
  if (!ok(i)) return stopHere('terraform init failed. The message above names the problem and the file to change. Fix it, then run this again.');

  // 2. plan
  const p = run(['plan', '-out=tfplan'], work);
  const pc = planCounts(p.out);
  rec.step('terraform plan -out=tfplan', keep(p.out, /^  # |^Plan:|^Error/), ok(p) ? 'One image, two networks (one per environment) and two containers, one per module instance.' : 'plan failed.');
  if (!ok(p) || !pc) return stopHere('terraform plan failed. Fix the file named in the error.');
  facts.plan_add_count = pc.add;

  // 3. apply
  const a = run(['apply', '-auto-approve', 'tfplan'], work);
  const ac = applyCounts(a.out);
  rec.step('terraform apply tfplan', short(grep(a.out, /Creation complete|Apply complete|^Error/).map(noId).join('\n')), ok(a) ? 'Two instances of one module, each with its own container name.' : 'The second container could not be created.');
  facts.apply_ok = ok(a);
  facts.apply_added_count = ac ? ac.added : 0;
  if (!ok(a)) {
    console.log(`\n${from(a.out, /^Error/).split('\n').slice(0, 6).join('\n')}`);
    return stopHere('terraform apply failed. Two module instances share something that must be different for each one.');
  }

  // 4. what the caller can see
  const show = run(['show', '-json'], work);
  facts.module_instances_count = (parse(show, 'terraform show -json').values?.root_module?.child_modules ?? []).length;
  const o = run(['output', '-json', 'apps'], work);
  const dev = parse(o, 'terraform output -json').dev ?? {};
  facts.output_keys_count = Object.keys(dev).length;
  facts.output_leaks_token = o.stdout.includes('fake-token-not-a-real-secret');
  const shown = dev.container ? { dev: { ...dev, container: '(the whole docker_container: about 70 attributes, cut here)' } } : { dev };
  rec.step(
    'terraform output -json apps',
    short(JSON.stringify(shown, null, 2)),
    facts.output_leaks_token
      ? 'The module hands its caller the whole container, including its environment variables. The fake token is in this output (cut here).'
      : `A module's outputs are its interface: ${Object.keys(dev).join(', ')}. Nothing else gets out.`,
  );

  // 5. two bad inputs
  const bad1 = run(['plan', '-refresh=false'], work, { TF_VAR_environments: '{ qa = { memory_mb = 64 } }' });
  facts.environment_validation_rejects = !ok(bad1) && /environment must be one of/.test(bad1.out);
  rec.step(
    "TF_VAR_environments='{ qa = { memory_mb = 64 } }' terraform plan",
    ok(bad1) ? keep(bad1.out, /^Plan:/) : keep(bad1.out, /^Error|environment must/),
    facts.environment_validation_rejects ? 'The module refuses an environment it does not know, before anything changes.' : 'The plan accepted an environment called "qa". The module has no rule against it.',
  );
  const bad2 = run(['plan', '-refresh=false'], work, { TF_VAR_environments: '{ dev = { memory_mb = 4096 } }' });
  facts.memory_validation_rejects = !ok(bad2) && /memory_mb must be between/.test(bad2.out);
  rec.step(
    "TF_VAR_environments='{ dev = { memory_mb = 4096 } }' terraform plan",
    ok(bad2) ? keep(bad2.out, /^Plan:/) : keep(bad2.out, /^Error|memory_mb must/),
    facts.memory_validation_rejects ? 'The module refuses a memory limit outside its range.' : 'The plan accepted 4096 MB. The module has no rule against it.',
  );

  // 6. plan again
  const p2 = run(['plan', '-detailed-exitcode'], work);
  const c2 = planCounts(p2.out);
  facts.second_plan_changes_count = /No changes/.test(p2.out) ? 0 : c2 ? c2.add + c2.change + c2.destroy : -1;
  rec.step('terraform plan -detailed-exitcode', keep(p2.out, /^No changes|^Plan:|^Error|infrastructure matches/), `Exit code ${p2.code}: 0 means nothing to do.`);

  // 7. destroy
  const d = run(['destroy', '-auto-approve'], work);
  const dm = /Destroy complete! Resources: (\d+) destroyed/.exec(d.out);
  facts.destroyed_count = dm ? Number(dm[1]) : 0;
  rec.step('terraform destroy -auto-approve', keep(d.out, /Destroy complete|^Error/), 'The two containers, two networks and the image resource go. The image itself stays on your machine (keep_locally).');

  if (useReference()) await demos();
}

// Two ways a module breaks its callers, shown on copies of the finished module (reference runs only).
async function demos() {
  const copy = (name) => {
    const d = join(work, '..', name);
    rmSync(d, { recursive: true, force: true });
    cpSync(work, d, { recursive: true, filter: (s) => !/[\\/](\.terraform|terraform\.tfstate[^\\/]*|tfplan)$/.test(s) });
    return d;
  };

  const a = copy('work-demo-provider');
  const mf = join(a, 'modules', 'app-container', 'main.tf');
  writeFileSync(mf, `provider "docker" {\n  host = "unix:///var/run/docker.sock"\n}\n\n${readFileSync(mf, 'utf8')}`);
  const r1 = await init(a);
  facts.demo_provider_block_error = firstMatch(r1.out, /^Error/).replace(/^Error: /, '');
  rec.step(
    'add provider "docker" { host = ... } inside the module, then terraform init',
    keep(r1.out, /^Error|^The module|legacy module|^provider configurations|^or depends/),
    'A provider block inside a module hides a setting from the caller and makes the module unusable with for_each, count and depends_on.',
  );
  rmSync(a, { recursive: true, force: true });

  const b = copy('work-demo-noreq');
  rmSync(join(b, 'modules', 'app-container', 'versions.tf'));
  const r2 = await init(b);
  facts.demo_missing_requirement_error = firstMatch(r2.out, /^Did you intend/).replace(/[?].*$/, "?");
  rec.step(
    'delete versions.tf from the module, then terraform init',
    keep(r2.out, /^Error|Could not retrieve|hashicorp\/docker|^Did you intend|address in each module/),
    'A module must say which provider it needs. Without that, Terraform looks for hashicorp/docker, which does not exist.',
  );
  rmSync(b, { recursive: true, force: true });
}

try {
  cleanup(N);
  save();
  await main();
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  // Clean up whatever is left: destroy what Terraform knows, then remove anything still labelled.
  if (existsSync(join(work, 'terraform.tfstate'))) run(['destroy', '-auto-approve'], work);
  cleanup(N);
  const left = leftovers(N);
  facts.leftover_count = left.containers + left.networks + left.volumes;
  save();
  rec.step(`node toolkit/cleanup.mjs ${N}`, `Still labelled tfc.challenge=${N}: ${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes.`, 'Everything this part made is gone. The alpine image stays.');
  if (recording() && useReference()) {
    rec.write(join(here, 'results.md'), `${process.platform}, runner ${mode()}, Terraform 1.17.1 in the pinned image, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c7.p1');
}
