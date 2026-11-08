// Challenge 8, part 3: a plan gate.
// Run: node challenges/challenge-8-tests-and-gate/part-3-plan-gate/run.mjs
// Add --record to also write results.md. Use --reference (or TFC_REFERENCE=1) to run the solution instead of your files.
//
// It applies a small stack (a network, a protected database container, a web container), then makes three plans:
// replace the web container, replace the database, remove the database. Each plan goes through your gate.mjs.
// Then it shows what a check block and a lifecycle precondition do, and tries Terraform's -policies flag.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, leftovers } from '../../../toolkit/docker.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { applyCounts, mode, planCounts } from '../../../toolkit/tf.js';
import { N, errorBlock, firstMatch, grep, init, run, saveFacts, short } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 8, part 3: a plan gate');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });

const facts = {
  init_ok: false,
  baseline_added_count: 0,
  gate_web_replace_exit_code: -1,
  gate_db_replace_exit_code: -1,
  gate_db_remove_exit_code: -1,
  gate_blocked_lines_count: 0,
  check_warns_and_continues: false,
  precondition_stops_plan: false,
  errored_plan_file_written: false,
  errored_plan_json_errored: false,
  errored_plan_apply_error: '',
  policy_plugin_missing: false,
  policy_exit_code: -1,
  destroyed_count: 0,
  leftover_count: -1,
};
const save = () => saveFacts('c8.p3', facts);

const noId = (l) => l.replace(/\[id=[0-9a-f]{12}[0-9a-f]*\]/, '[id=...]');

/** terraform plan with some variables, saved to a file, shown as JSON and sent through the gate. */
function planThroughGate(id, vars) {
  const varArgs = Object.entries(vars).flatMap(([k, v]) => ['-var', `${k}=${v}`]);
  const plan = run(['plan', '-out=gate.tfplan', ...varArgs], work);
  const counts = planCounts(plan.out);
  const show = run(['show', '-json', 'gate.tfplan'], work);
  mkdirSync(join(work, 'plans'), { recursive: true });
  writeFileSync(join(work, 'plans', `${id}.json`), show.stdout);
  const gate = spawnSync(process.execPath, [join(work, 'gate.mjs')], { input: show.stdout, encoding: 'utf8', cwd: work });
  const out = `${gate.stdout}${gate.stderr}`.trim();
  return { counts, code: gate.status ?? -1, out, planOk: plan.code === 0 };
}

async function main() {
  const i = await init(work);
  facts.init_ok = i.code === 0;
  rec.step('terraform init', short(grep(i.out, /^- (Find|Install)|^Terraform has been|^Error/).join('\n')), 'init downloads the Docker provider.');
  if (i.code !== 0) return stop('terraform init failed.');

  // 1. baseline
  const a = run(['apply', '-auto-approve'], work);
  const ac = applyCounts(a.out);
  facts.baseline_added_count = ac ? ac.added : 0;
  rec.step('terraform apply -auto-approve', short([...grep(a.out, /Creation complete|Apply complete|^Error/).map(noId)].join('\n')), 'The stack: image, network, the database (tagged protected) and a web container.');
  if (!ac) return stop(`terraform apply failed:\n${errorBlock(a.out, 8)}`);

  // 2. three plans through the gate
  const scenarios = [
    { id: 'web_replace', fact: 'gate_web_replace_exit_code', vars: { web_name: 'tfc-c8-web2' }, say: 'The web container is not protected. Replacing it is allowed.' },
    { id: 'db_replace', fact: 'gate_db_replace_exit_code', vars: { db_name: 'tfc-c8-db2' }, say: 'Renaming the database replaces it: the old one is destroyed. The gate must refuse.' },
    { id: 'db_remove', fact: 'gate_db_remove_exit_code', vars: { with_db: 'false' }, say: 'with_db = false removes the database. The gate must refuse.' },
  ];
  for (const s of scenarios) {
    const r = planThroughGate(s.id, s.vars);
    facts[s.fact] = r.code;
    if (r.code === 1) facts.gate_blocked_lines_count += r.out.split('\n').filter((l) => l.startsWith('BLOCKED')).length;
    const flags = Object.entries(s.vars).map(([k, v]) => `-var ${k}=${v}`).join(' ');
    rec.step(
      `terraform plan -out=gate.tfplan ${flags}  then  terraform show -json gate.tfplan | node gate.mjs`,
      short([r.counts ? `Plan: ${r.counts.add} to add, ${r.counts.change} to change, ${r.counts.destroy} to destroy.` : 'plan failed', r.out, `gate exit code: ${r.code}`].join('\n')),
      s.say,
    );
  }

  // 3. a check block warns, a precondition stops
  const c = run(['plan', '-var', 'web_memory_mb=200'], work);
  facts.check_warns_and_continues = c.code === 0 && /Check block assertion failed/.test(c.out);
  rec.step('terraform plan -var web_memory_mb=200', short([...grep(c.out, /^Warning|^Plan:|^web_memory_mb|Check block assertion failed/), `exit code: ${c.code}`].join('\n')), 'A check block reports a warning and the plan carries on. It cannot stop anything.');
  const pre = run(['plan', '-out=pre.tfplan', '-var', 'db_memory_mb=8'], work);
  facts.precondition_stops_plan = pre.code !== 0 && /precondition failed/i.test(pre.out);
  facts.errored_plan_file_written = existsSync(join(work, 'pre.tfplan'));
  rec.step('terraform plan -out=pre.tfplan -var db_memory_mb=8', short([errorBlock(pre.out, 8), `exit code: ${pre.code}; plan file written: ${facts.errored_plan_file_written}`].join('\n')), 'A precondition stops the plan with an error. Terraform still writes the plan file. Look at it next.');
  if (facts.errored_plan_file_written) {
    const sj = run(['show', '-json', 'pre.tfplan'], work);
    let errored = false;
    try {
      errored = JSON.parse(sj.stdout).errored === true;
    } catch { /* not json */ }
    facts.errored_plan_json_errored = errored;
    const ap = run(['apply', 'pre.tfplan'], work);
    facts.errored_plan_apply_error = firstMatch(ap.out, /^Error/).replace(/^Error: /, '');
    rec.step('terraform show -json pre.tfplan  (the field "errored"), then terraform apply pre.tfplan', short([`"errored": ${errored}`, errorBlock(ap.out, 5)].join('\n')), 'The plan file of a failed plan says errored: true, and apply refuses it. A gate that only looks for destroy actions would read this file and find nothing wrong: it must refuse errored plans too.');
  }

  // 4. Terraform Policy
  mkdirSync(join(work, 'policies'), { recursive: true });
  const pol = run(['plan', '-policies=./policies'], work);
  facts.policy_plugin_missing = /tfpolicy-plugin/.test(pol.out);
  facts.policy_exit_code = pol.code;
  rec.step('terraform plan -policies=./policies   (an empty policies folder)', short([errorBlock(pol.out, 6), `exit code: ${pol.code}`].join('\n')), 'In 1.17.1 the flag exists, but the policy engine is a separate program, tfpolicy-plugin, that the official image does not contain. The plan is printed, the error comes after it, and the exit code is still 0: a pipeline that only checks the exit code would pass. Terraform Policy cannot be run from this toolkit. The gate script does the same job with no extra program.');

  const d = run(['destroy', '-auto-approve'], work);
  const dm = /Destroy complete! Resources: (\d+) destroyed/.exec(d.out);
  facts.destroyed_count = dm ? Number(dm[1]) : 0;
  rec.step('terraform destroy -auto-approve', short(grep(d.out, /Destroy complete|^Error/).join('\n')), 'Destroy has no gate here: the gate reads a plan, and this is run by hand. A pipeline would plan the destroy first and show the plan to the gate the same way.');
}

function stop(why) {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
}

try {
  cleanup(N);
  save();
  await main();
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (existsSync(join(work, 'terraform.tfstate')) && facts.destroyed_count === 0) run(['destroy', '-auto-approve'], work);
  cleanup(N);
  const left = leftovers(N);
  facts.leftover_count = left.containers + left.networks + left.volumes;
  save();
  rec.step(`node toolkit/cleanup.mjs ${N}`, `Still labelled tfc.challenge=${N}: ${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes.`, 'Everything this part made is gone. The alpine image stays.');
  if (recording() && useReference()) {
    rec.write(join(here, 'results.md'), `${process.platform}, runner ${mode()}, Terraform 1.17.1 in the pinned image, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c8.p3');
}
