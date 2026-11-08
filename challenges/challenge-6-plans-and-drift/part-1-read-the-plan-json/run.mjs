// Challenge 6, part 1: read the plan JSON.
// Run: node challenges/challenge-6-plans-and-drift/part-1-read-the-plan-json/run.mjs
// Add --record to also write results.md, chart.svg and fixtures/changes.json next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the reference solution instead of your files.
//
// It applies before/main.tf (two containers, a file and three small resources), then plans this month's main.tf
// (never applies it), saves the plan, reads `terraform show -json` with Node and runs YOUR classify.mjs over it.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { cleanup } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, initRetry, lines, pick, planSummary, tfRetry } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 6, part 1: read the plan JSON');
const work = prepareWork(import.meta.url);
const live = join(work, 'live');
mkdirSync(live, { recursive: true });

const run = (args) => tfRetry(args, { cwd: live, docker: true });
const TRUTH = {
  'docker_container.web': 'replace',
  'docker_container.worker': 'update',
  'local_file.motd': 'replace',
  'terraform_data.old': 'delete',
  'terraform_data.newcomer': 'create',
  'terraform_data.same': 'none',
  'terraform_data.cbd': 'replace',
};
const pad = (s, n) => String(s).padEnd(n);

try {
  cleanup(N);

  copyFileSync(join(work, 'before', 'main.tf'), join(live, 'main.tf'));
  initRetry(live, ['init'], { docker: true });
  const base = run(['apply', '-auto-approve']);
  rec.step('terraform apply -auto-approve     (before/main.tf: what is deployed today)', pick(base.out, /Apply complete|^Error/), 'Two containers, one file and three small resources exist now.');

  // The plan nobody read.
  copyFileSync(join(work, 'main.tf'), join(live, 'main.tf'));
  const plan = run(['plan', '-out=plan.tfplan']);
  const s = planSummary(plan.out);
  rec.step(
    'terraform plan -out=plan.tfplan     (the pull request\'s main.tf)',
    lines(plan.out).filter((l) => /^  # |^Plan:|forces replacement|^Saved the plan/.test(l)).join('\n'),
    `The last line says ${s.add} to add, ${s.change} to change, ${s.destroy} to destroy. It does not say which of those are replacements. The "forces replacement" lines are the clue, and they are in the middle of a long text.`,
  );
  setFact('c6.p1.plan_text_add_count', s.add);
  setFact('c6.p1.plan_text_change_count', s.change);
  setFact('c6.p1.plan_text_destroy_count', s.destroy);

  // The JSON.
  const shown = run(['show', '-json', 'plan.tfplan']);
  const plan1 = JSON.parse(shown.stdout);
  const changes = plan1.resource_changes.map((c) => ({ address: c.address, type: c.type, actions: c.change.actions, action_reason: c.action_reason ?? null, replace_paths: c.change.replace_paths ?? [] }));
  rec.step(
    'terraform show -json plan.tfplan     (then read resource_changes with Node: address, actions, action_reason)',
    changes.map((c) => `${pad(c.address, 26)} ${pad(JSON.stringify(c.actions), 20)} ${c.action_reason ?? ''}`).join('\n'),
    'One entry per resource, and an actions list. A replacement is two actions: ["delete","create"], or ["create","delete"] when create_before_destroy is set. The order is not the same, and both are replacements.',
  );
  setFact('c6.p1.resources_in_plan_count', changes.length);
  const cbd = changes.find((c) => c.address === 'terraform_data.cbd');
  setFact('c6.p1.cbd_actions', cbd.actions.join(','));
  setFact('c6.p1.web_actions', changes.find((c) => c.address === 'docker_container.web').actions.join(','));

  // The learner's classifier.
  const mod = await import(`${pathToFileURL(join(work, 'classify.mjs')).href}?t=${Date.now()}`);
  const rows = changes.map((c) => {
    let yours = 'error';
    let reasons = [];
    try {
      yours = mod.classify({ actions: c.actions, replace_paths: c.replace_paths, action_reason: c.action_reason });
      reasons = mod.replaceReasons({ actions: c.actions, replace_paths: c.replace_paths, action_reason: c.action_reason });
    } catch (e) {
      yours = `error: ${e.message}`;
    }
    const truth = TRUTH[c.address];
    const truthReasons = c.replace_paths.map((p) => p.join('.'));
    return { c, yours, truth, ok: yours === truth, reasons, truthReasons, reasonsOk: JSON.stringify(reasons) === JSON.stringify(truthReasons) };
  });
  rec.step(
    'node: run classify() and replaceReasons() from classify.mjs over every change',
    rows.map((r) => `${r.ok ? 'ok   ' : 'WRONG'} ${pad(r.c.address, 26)} yours: ${pad(r.yours, 8)} truth: ${pad(r.truth, 8)} reasons: ${r.truthReasons.join(', ') || '-'}${r.reasonsOk ? '' : `   (yours: ${r.reasons.join(', ') || '-'})`}`).join('\n'),
    rows.every((r) => r.ok && r.reasonsOk) ? 'Every change is classified, and every replacement names the attribute that forced it.' : 'Each WRONG line is a resource your classifier would let through review with the wrong label. Fix classify.mjs and run again.',
  );
  const count = (k) => rows.filter((r) => r.truth === k).length;
  for (const k of ['create', 'update', 'replace', 'delete', 'none']) setFact(`c6.p1.truth_${k}_count`, count(k));
  setFact('c6.p1.classify_correct_count', rows.filter((r) => r.ok).length);
  setFact('c6.p1.reasons_correct_count', rows.filter((r) => r.reasonsOk).length);
  setFact('c6.p1.web_replace_reasons', rows.find((r) => r.c.address === 'docker_container.web').truthReasons.join(','));
  setFact('c6.p1.motd_replace_reasons', rows.find((r) => r.c.address === 'local_file.motd').truthReasons.join(','));
  const replaceReason = changes.find((c) => c.address === 'docker_container.web').action_reason;
  setFact('c6.p1.web_action_reason', replaceReason ?? 'none');

  // A replacement asked for by hand.
  const plan2 = run(['plan', '-replace=terraform_data.same', '-out=plan2.tfplan']);
  const j2 = JSON.parse(run(['show', '-json', 'plan2.tfplan']).stdout);
  const same = j2.resource_changes.find((c) => c.address === 'terraform_data.same');
  rec.step(
    'terraform plan -replace=terraform_data.same -out=plan2.tfplan ; terraform show -json plan2.tfplan',
    `${lines(plan2.out).filter((l) => /^  # terraform_data.same|^Plan:/.test(l)).join('\n')}\nterraform_data.same  actions ${JSON.stringify(same.change.actions)}  action_reason ${same.action_reason}`,
    'Same actions list, but a different reason: replace_by_request. The reason tells you why Terraform wants the replacement: your code, a tainted resource, or a request on the command line.',
  );
  setFact('c6.p1.requested_replace_reason', same.action_reason);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, ${useReference() ? 'reference solution' : 'starter files'}, Node ${process.versions.node}, TFC_MODE=${process.env.TFC_MODE ?? 'default'}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'What the pull request does, resource by resource',
        unit: 'resources',
        bars: ['create', 'update', 'replace', 'delete', 'none'].map((k) => ({ label: k, value: count(k) })),
      }),
    );
    if (useReference()) writeFileSync(join(here, 'fixtures', 'changes.json'), `${JSON.stringify(changes, null, 2)}\n`);
    console.log('\nWrote results.md, chart.svg and fixtures/changes.json');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c6.p1');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  cleanup(N);
}
