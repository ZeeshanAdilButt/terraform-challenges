// Challenge 6, part 2: drift and refresh-only.
// Run: node challenges/challenge-6-plans-and-drift/part-2-drift-and-refresh-only/run.mjs
// Add --record to also write results.md, chart.svg and fixtures/drift-plan.json next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the reference solution instead of your files.
//
// It creates a labelled container, changes it behind Terraform's back with the docker CLI (a rename, then a stop),
// and shows what plan, plan -refresh-only, apply -refresh-only, -detailed-exitcode and -minimal-refresh say.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { cleanup, run as docker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, initRetry, lines, pick, planSummary, stateInfo, tfRetry } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 6, part 2: drift and refresh-only');
const work = prepareWork(import.meta.url);
const live = join(work, 'live');
mkdirSync(live, { recursive: true });
writeFileSync(join(live, 'main.tf'), readFileSync(join(work, 'main.tf')));

const NAME = 'tfc-c6-app';
const run = (args) => tfRetry(args, { cwd: live, docker: true });
const dock = (args) => {
  const r = docker(args);
  if (r.code !== 0) throw new Error(`docker ${args.join(' ')} failed: ${r.stderr}`);
};
const keyLines = (out) => lines(out).filter((l) => /^  # |^Plan:|^No changes|^Note: Objects|# forces replacement|^This is a refresh-only|~ name|~ must_run|\+ exit_code/.test(l)).join('\n');
const code = (r) => `[exit code ${r.code}]`;
const mod = await import(`${pathToFileURL(join(work, 'drift.mjs')).href}?t=${Date.now()}`);
const safe = (fn, ...a) => {
  try {
    return fn(...a);
  } catch (e) {
    return `error: ${e.message}`;
  }
};

try {
  cleanup(N);
  initRetry(live, ['init'], { docker: true });
  const ap = run(['apply', '-auto-approve']);
  rec.step('terraform apply -auto-approve', pick(ap.out, /^docker_container.*Creation|^terraform_data.*Creation|Apply complete|^Error/), 'A container named tfc-c6-app and a small record. Terraform and Docker agree.');

  // Exit codes.
  const p0 = run(['plan', '-detailed-exitcode']);
  rec.step('terraform plan -detailed-exitcode', `${keyLines(p0.out) || lines(p0.out).slice(-2).join('\n')}\n${code(p0)}   your verdict(): ${safe(mod.verdict, p0.code)}`, 'Exit code 0: nothing to change.');
  const pe = run(['plan', '-detailed-exitcode', '-var-file=nope.tfvars']);
  rec.step('terraform plan -detailed-exitcode -var-file=nope.tfvars', `${lines(pe.out).slice(0, 4).join('\n')}\n${code(pe)}   your verdict(): ${safe(mod.verdict, pe.code)}`, 'Exit code 1: an error. It is not drift, and a job that reports it as drift sends someone to look at the wrong thing.');
  setFact('c6.p2.exit_code_clean', p0.code);
  setFact('c6.p2.exit_code_error', pe.code);
  setFact('c6.p2.error_line', lines(pe.out).find((l) => /^Error:/.test(l)) ?? 'none');
  setFact('c6.p2.verdict_clean', safe(mod.verdict, p0.code));
  setFact('c6.p2.verdict_error', safe(mod.verdict, pe.code));

  // Drift B: a stop, and -minimal-refresh.
  dock(['stop', NAME]);
  const mini = run(['plan', '-minimal-refresh', '-detailed-exitcode']);
  const full = run(['plan', '-detailed-exitcode']);
  const refreshing = (r) => lines(r.out).filter((l) => /: Refreshing state/.test(l)).length;
  rec.step(
    `docker stop ${NAME} ; terraform plan -minimal-refresh -detailed-exitcode ; terraform plan -detailed-exitcode`,
    `-minimal-refresh: "Refreshing state" lines: ${refreshing(mini)}   ${keyLines(mini.out) || 'No changes.'}   ${code(mini)}\nplain plan:       "Refreshing state" lines: ${refreshing(full)}   ${keyLines(full.out).split('\n').filter((l) => /^  # |^Plan:/.test(l)).join(' | ')}   ${code(full)}`,
    '-minimal-refresh (Terraform 1.17) refreshes only the resources that already have a planned change. Here the code and the state agree, so nothing is refreshed and the stop goes unseen: "No changes", exit code 0. A plain plan refreshes everything and sees it. -minimal-refresh is faster on a big state and blind to drift in everything it does not refresh. Use it for quick plans, never for a drift check.',
  );
  setFact('c6.p2.minimal_refresh_exit_code', mini.code);
  setFact('c6.p2.minimal_refresh_refreshed_count', refreshing(mini));
  setFact('c6.p2.minimal_refresh_sees_stop', mini.code === 2);
  setFact('c6.p2.full_plan_exit_code_after_stop', full.code);
  setFact('c6.p2.full_plan_refreshed_count', refreshing(full));
  dock(['start', NAME]);
  const back = run(['plan', '-detailed-exitcode']);
  rec.step(`docker start ${NAME} ; terraform plan -detailed-exitcode`, `${keyLines(back.out) || lines(back.out).slice(-2).join('\n')}\n${code(back)}`, 'Started again: Terraform and Docker agree, and the next steps begin from a clean plan.');
  setFact('c6.p2.exit_code_after_start', back.code);

  // Drift A: a rename.
  dock(['rename', NAME, `${NAME}-moved`]);
  const pa = run(['plan', '-detailed-exitcode']);
  const sa = planSummary(pa.out);
  rec.step(`docker rename ${NAME} ${NAME}-moved ; terraform plan -detailed-exitcode`, `${keyLines(pa.out)}\n${code(pa)}   your verdict(): ${safe(mod.verdict, pa.code)}`, 'Somebody renamed the container by hand. Terraform reads the real name, sees it differs from the code, and plans to destroy the container and build a new one with the right name. The container is "drifted", and the plan to fix it is a destroy.');
  setFact('c6.p2.exit_code_rename_plan', pa.code);
  setFact('c6.p2.rename_plan_add_count', sa.add);
  setFact('c6.p2.rename_plan_destroy_count', sa.destroy);
  setFact('c6.p2.verdict_changes', safe(mod.verdict, pa.code));

  const pr = run(['plan', '-refresh-only', '-detailed-exitcode', '-out=drift.tfplan']);
  const js = JSON.parse(run(['show', '-json', 'drift.tfplan']).stdout);
  const drifted = safe(mod.driftedAddresses, js);
  rec.step(
    'terraform plan -refresh-only -detailed-exitcode -out=drift.tfplan ; terraform show -json drift.tfplan',
    `${keyLines(pr.out)}\n${code(pr)}\nin the JSON: resource_changes has ${(js.resource_changes ?? []).length} entries, resource_drift has ${(js.resource_drift ?? []).length}\nyour driftedAddresses(): ${JSON.stringify(drifted)}`,
    'A refresh-only plan only looks. It shows what changed outside Terraform and plans no action. In the JSON, the drift is under resource_drift, not resource_changes.',
  );
  setFact('c6.p2.exit_code_refresh_only_plan', pr.code);
  setFact('c6.p2.refresh_only_resource_changes_count', (js.resource_changes ?? []).length);
  setFact('c6.p2.refresh_only_resource_drift_count', (js.resource_drift ?? []).length);
  setFact('c6.p2.drifted_addresses', Array.isArray(drifted) ? drifted.join(',') : String(drifted));
  setFact('c6.p2.refresh_only_name_line', lines(pr.out).find((l) => /~ name/.test(l))?.trim().replace(/\s+/g, ' ') ?? 'none');
  if (recording() && useReference()) {
    mkdirSync(join(here, 'fixtures'), { recursive: true });
    writeFileSync(
      join(here, 'fixtures', 'drift-plan.json'),
      `${JSON.stringify({ resource_changes: js.resource_changes ?? [], resource_drift: (js.resource_drift ?? []).map((d) => ({ address: d.address, type: d.type, change: { actions: d.change.actions } })) }, null, 2)}\n`,
    );
  }

  const ar = run(['apply', '-refresh-only', '-auto-approve']);
  const stateName = JSON.stringify(JSON.parse(readFileSync(join(live, 'terraform.tfstate'), 'utf8')).resources.find((r) => r.type === 'docker_container').instances[0].attributes.name);
  const pAfter = run(['plan', '-detailed-exitcode']);
  rec.step(
    'terraform apply -refresh-only -auto-approve ; terraform plan -detailed-exitcode',
    `${pick(ar.out, /^Apply complete|^Error/)}\nname in the state file now: ${stateName}\n${keyLines(pAfter.out)}\n${code(pAfter)}`,
    'apply -refresh-only copies the real world into the state, nothing else. The state now says -moved. The code still says tfc-c6-app, so the plan still wants to destroy and rebuild. Accepting drift is not the same as fixing it.',
  );
  setFact('c6.p2.refresh_only_apply_exit_code', ar.code);
  setFact('c6.p2.state_name_after_refresh_only', stateName.replaceAll('"', ''));
  setFact('c6.p2.exit_code_plan_after_refresh_only_apply', pAfter.code);
  setFact('c6.p2.plan_after_refresh_only_destroy_count', planSummary(pAfter.out).destroy);

  dock(['rename', `${NAME}-moved`, NAME]);
  const pFixed = run(['plan', '-detailed-exitcode']);
  rec.step(`docker rename ${NAME}-moved ${NAME} ; terraform plan -detailed-exitcode`, `${keyLines(pFixed.out) || lines(pFixed.out).slice(-2).join('\n')}\n${code(pFixed)}`, 'Putting the real world back (or changing the code to match it) ends the drift. Both are decisions for a person; apply -refresh-only is neither.');
  setFact('c6.p2.exit_code_after_revert', pFixed.code);

  const st = stateInfo(join(live, 'terraform.tfstate'));
  setFact('c6.p2.state_resources_count', st.resources.length);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, ${useReference() ? 'reference solution' : 'starter files'}, Node ${process.versions.node}, TFC_MODE=${process.env.TFC_MODE ?? 'default'}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Exit code of terraform plan -detailed-exitcode, by situation',
        unit: '',
        bars: [
          { label: 'nothing changed', value: p0.code },
          { label: 'error (missing var file)', value: pe.code },
          { label: 'container renamed', value: pa.code },
          { label: 'container stopped, -minimal-refresh', value: mini.code },
          { label: 'container stopped, full refresh', value: full.code },
        ],
      }),
    );
    console.log('\nWrote results.md, chart.svg and fixtures/drift-plan.json');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c6.p2');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  cleanup(N);
}
