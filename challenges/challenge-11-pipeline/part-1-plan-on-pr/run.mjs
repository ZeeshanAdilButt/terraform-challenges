// Challenge 11, part 1: plan on pull request.
// Run: node challenges/challenge-11-pipeline/part-1-plan-on-pr/run.mjs
// Add --record to also write results.md next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the solution instead of your files.
//
// It runs your pipeline step (ci/plan.mjs) the way a pull request would: on a fresh branch, after a first apply
// (nothing to change), after a change that destroys the database container, after a change that destroys the data
// volume too, with a badly formatted file, and with a broken file. Then it reads your workflow file and checks that
// every "uses:" line is pinned to a full commit SHA. Nothing is pushed anywhere.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, leftovers, assertDocker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { planCounts, versionLine, mode } from '../../../toolkit/tf.js';
import { N, terra, initWork, tail, head, runNodeRetry as runNode, read } from '../lib/common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 11, part 1: plan on pull request');

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareWork(import.meta.url, { keep: ['.github'] });
const infra = join(work, 'infra');
const mainTf = join(infra, 'main.tf');
const plan = (extra = []) => runNode([join(work, 'ci', 'plan.mjs'), infra, ...extra], { cwd: work });
const md = () => read(join(infra, 'plan.md')).trimEnd();
const original = readFileSync(mainTf, 'utf8');
const timings = [];

/** Lines of the pipeline output without the timings, so the recorded text stays stable. */
const stable = (t) => t.replace(/\(\d+(\.\d+)?s\)/g, '(Ns)');

try {
  cleanup(N);

  // 1. the first plan on a new branch
  const init0 = await initWork(infra);
  if (init0.code !== 0) throw new Error(init0.out);
  const r1 = await plan();
  const md1 = md();
  const shown1 = await terra(infra, ['show', '-no-color', 'plan.tfplan']);
  const counts1 = planCounts(shown1.out);
  const mdCounts1 = /\*\*Plan: (\d+) to add, (\d+) to change, (\d+) to destroy\.\*\*/.exec(md1);
  rec.step(
    'node ci/plan.mjs infra\ncat infra/plan.md',
    `${head(stable(r1.out), 8)}\n\n${md1}`,
    'Five steps in a fixed order, then a Markdown file. The workflow posts that file as the comment on the pull request.',
  );

  // 2. apply it, then plan again: nothing to do
  const apply1 = await terra(infra, ['apply', '-input=false', 'plan.tfplan']);
  const r2 = await plan();
  const md2 = md();
  rec.step(
    'terraform apply plan.tfplan\nnode ci/plan.mjs infra\ncat infra/plan.md',
    `${tail(apply1.out, 1)}\n${head(stable(r2.out), 8)}\n\n${md2}`,
    'Applied once. The next pull request that changes nothing says so in one line.',
  );

  // 3. a change that rebuilds the database container
  writeFileSync(mainTf, original.replace('default = "standard"', 'default = "fast"'));
  const r3 = await plan();
  const md3 = md();
  rec.step(
    'edit infra/main.tf: default = "fast"\nnode ci/plan.mjs infra\ncat infra/plan.md',
    `${head(stable(r3.out), 8)}\n\n${md3}`,
    'One changed word, and the container must be replaced. The warning line is what a reviewer sees first.',
  );

  // 4. a change that rebuilds the data volume too
  writeFileSync(mainTf, original.replace('name = "tfc-c11-p1-data"', 'name = "tfc-c11-p1-data-v2"'));
  const r4 = await plan();
  const md4 = md();
  rec.step(
    'edit infra/main.tf: rename the volume\nnode ci/plan.mjs infra\ncat infra/plan.md',
    `${head(stable(r4.out), 8)}\n\n${md4}`,
    'A renamed volume is a new, empty volume. The old one, and what is in it, is destroyed. The table lists both resources.',
  );

  // 5. a badly formatted file
  writeFileSync(mainTf, original.replace('memory      = 64', 'memory = 64'));
  const r5 = await plan();
  const md5 = md();
  rec.step(
    'edit infra/main.tf: remove the alignment spaces of one line\nnode ci/plan.mjs infra\ncat infra/plan.md',
    `${stable(r5.out).split('\n').filter((l) => l.trim()).slice(0, 14).join('\n')}\n\n${md5.split('\n').slice(0, 4).join('\n')}`,
    'Formatting is checked before the plan is made. The pipeline stops at the fmt step, with exit code 1, and the comment says where.',
  );

  // 6. a broken file
  writeFileSync(mainTf, original.replace('${var.db_mode}', '${var.db_modee}'));
  const r6 = await plan();
  const md6 = md();
  rec.step(
    'edit infra/main.tf: a typo in a variable name\nnode ci/plan.mjs infra',
    stable(r6.out).split('\n').filter((l) => l.trim()).slice(0, 14).join('\n'),
    'A typo is caught by validate, before fmt and before any plan. Cheap checks first.',
  );
  writeFileSync(mainTf, original);

  // 7. the workflow file
  const wf = read(join(work, '.github', 'workflows', 'plan.yml'));
  const uses = wf.split('\n').map((l) => /^\s*-?\s*uses:\s*(\S+)/.exec(l)).filter(Boolean).map((m) => m[1]);
  const pinned = uses.filter((u) => /@[0-9a-f]{40}$/.test(u));
  rec.step(
    'grep "uses:" .github/workflows/plan.yml',
    uses.map((u) => `${/@[0-9a-f]{40}$/.test(u) ? 'pinned  ' : 'NOT PINNED  '}${u}`).join('\n') || '(no uses lines)',
    'A full 40-character commit SHA cannot be moved. A tag such as v7 can. Each SHA in the reference was checked with: gh api repos/<owner>/<repo>/commits/<tag> -q .sha',
  );

  // 8. clean up
  const destroy = await terra(infra, ['destroy', '-auto-approve', '-input=false']);
  rec.step('cd infra && terraform destroy -auto-approve', tail(destroy.out, 1), 'The first apply built three things (an image resource, a volume, a container); the destroy removes them.');

  // facts
  const mdHeadline = (t) => /\*\*Plan: (\d+) to add, (\d+) to change, (\d+) to destroy\.\*\*/.exec(t);
  const m3 = mdHeadline(md3);
  const m4 = mdHeadline(md4);
  setFact('c11.p1.first_plan_add_count', counts1?.add ?? 0);
  setFact('c11.p1.md_headline_matches_terraform', !!mdCounts1 && !!counts1 && +mdCounts1[1] === counts1.add && +mdCounts1[2] === counts1.change && +mdCounts1[3] === counts1.destroy);
  setFact('c11.p1.first_run_exit_code', r1.code);
  setFact('c11.p1.first_run_steps_ok_count', (r1.out.match(/\.\.\. ok/g) || []).length);
  setFact('c11.p1.no_changes_md', md2.includes('**No changes.**'));
  setFact('c11.p1.replace_destroy_count', m3 ? +m3[3] : 0);
  setFact('c11.p1.replace_add_count', m3 ? +m3[1] : 0);
  setFact('c11.p1.replace_warning_present', md3.includes('> **Warning:**'));
  setFact('c11.p1.volume_replace_destroy_count', m4 ? +m4[3] : 0);
  setFact('c11.p1.volume_replace_rows_count', (md4.match(/^\| `docker_/gm) || []).length);
  setFact('c11.p1.fmt_failure_exit_code', r5.code);
  setFact('c11.p1.fmt_failure_stopped_at_fmt', /terraform fmt .* FAILED/.test(r5.out) && !/terraform plan .* ok/.test(r5.out));
  setFact('c11.p1.fmt_failure_in_comment', /Failed at the fmt step/.test(md5));
  setFact('c11.p1.validate_failure_exit_code', r6.code);
  setFact('c11.p1.validate_failure_stopped_before_fmt', /terraform validate .* FAILED/.test(r6.out) && !/terraform fmt/.test(r6.out.replace(/terraform validate[^\n]*/, '')));
  setFact('c11.p1.validate_failure_text', (r6.out.match(/Error: [^\n]*/) || ['none'])[0].replace(/^Error: /, ''));
  setFact('c11.p1.workflow_uses_count', uses.length);
  setFact('c11.p1.workflow_unpinned_count', uses.length - pinned.length);

  const left = leftovers(N);
  setFact('c11.p1.leftover_count', left.containers + left.networks + left.volumes);
  rec.step(
    `docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=${N})`,
    `${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes`,
    'Everything this part built is gone.',
  );

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, ${versionLine()} (${mode()} mode), Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c11.p1');
} catch (e) {
  console.error(`\nStopped: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  if (existsSync(mainTf)) writeFileSync(mainTf, original);
  cleanup(N);
}
