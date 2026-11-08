// Challenge 5, part 1: state commands on local state.
// Run: node challenges/challenge-5-state/part-1-state-commands/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the reference solution instead of your files.
//
// It applies last month's configuration (before/main.tf) in work/live/, then switches to this month's main.tf,
// shows that the plan wants to destroy and create, runs YOUR commands from commands.txt, and plans again.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { cleanup } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, initRetry, lines, pick, planSummary, stateInfo, tfRetry } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 5, part 1: state commands');
const work = prepareWork(import.meta.url);
const live = join(work, 'live');
mkdirSync(live, { recursive: true });

const ALLOWED = new Set(['list', 'show', 'mv', 'rm', 'pull']);
const run = (args) => tfRetry(args, { cwd: live });
const planLines = (out) => lines(out).filter((l) => /^  # .* (will be|must be)|^Plan:|^No changes/.test(l)).join('\n');

try {
  cleanup(N);

  // Step 1: last month.
  copyFileSync(join(work, 'before', 'main.tf'), join(live, 'main.tf'));
  initRetry(live);
  const ap = run(['apply', '-auto-approve']);
  rec.step('terraform apply -auto-approve     (last month\'s configuration)', pick(ap.out, /^local_file\.\w+: Creation|^terraform_data|Apply complete/), 'Three resources, three entries in the state.');
  const list0 = run(['state', 'list']);
  rec.step('terraform state list', lines(list0.out).join('\n'), 'The address of a resource is its type and its name. This is what state commands take as arguments.');
  const show = run(['state', 'show', 'local_file.notes']);
  rec.step('terraform state show local_file.notes', lines(show.out).filter((l) => !/content_(base64|sha|md5)/.test(l)).join('\n'), 'What the state remembers about one resource (hash lines left out here). Read only; it changes nothing.');
  setFact('c5.p1.resources_in_state_count', lines(list0.out).length);

  // Step 2: this month's configuration, state not touched yet.
  copyFileSync(join(work, 'main.tf'), join(live, 'main.tf'));
  const p1 = run(['plan']);
  const s1 = planSummary(p1.out);
  rec.step('terraform plan     (this month\'s configuration, state still old)', planLines(p1.out), 'Terraform sees notes and legacy in the state with no code, and readme in the code with no state. It plans to destroy two things and create one. The file legacy.txt would be deleted.');
  setFact('c5.p1.plan_before_add_count', s1.add);
  setFact('c5.p1.plan_before_destroy_count', s1.destroy);

  // Step 3: the learner's commands.
  const cmds = readFileSync(join(work, 'commands.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const outputs = [];
  let failed = 0;
  let ran = 0;
  for (const c of cmds) {
    const args = c.split(/\s+/);
    if (args[0] !== 'state' || !ALLOWED.has(args[1])) {
      outputs.push(`$ ${c}\n(skipped: only terraform state ${[...ALLOWED].join(', ')} are allowed here)`);
      failed += 1;
      continue;
    }
    const r = run(args);
    ran += 1;
    if (r.code !== 0) failed += 1;
    outputs.push(`$ terraform ${c}\n${lines(r.out).join('\n')}${r.code !== 0 ? `\n[exit code ${r.code}]` : ''}`);
  }
  rec.step('your commands, from commands.txt', outputs.join('\n') || '(commands.txt has no commands yet)', cmds.length ? 'Each command rewrites the state file and keeps the version before it in terraform.tfstate.backup.' : 'Nothing was changed. Edit commands.txt.');
  setFact('c5.p1.commands_run_count', ran);
  setFact('c5.p1.commands_failed_count', failed);

  // Step 4: plan again.
  const p2 = run(['plan']);
  const s2 = planSummary(p2.out);
  rec.step('terraform plan', planLines(p2.out) || lines(p2.out).slice(-4).join('\n'), s2.none ? 'No changes. The state now matches the new code, and nothing was created or destroyed in the real world.' : 'The plan still wants changes. Read each line: which address is the code using, and which one is the state using?');
  setFact('c5.p1.plan_after_no_changes', s2.none);
  setFact('c5.p1.plan_after_destroy_count', s2.destroy);
  setFact('c5.p1.plan_after_add_count', s2.add);

  // Step 5: what is on disk.
  const legacyKept = existsSync(join(live, 'out', 'legacy.txt'));
  const files = readdirSync(live).filter((f) => /^terraform.tfstate/.test(f)).sort((x, y) => (stateInfo(join(live, x))?.serial ?? 0) - (stateInfo(join(live, y))?.serial ?? 0));
  const infos = files.map((f) => ({ f, ...stateInfo(join(live, f)) }));
  rec.step(
    'ls out/ ; ls terraform.tfstate* (with the serial and the resources inside each file)',
    [`out/: ${['notes.txt', 'legacy.txt'].filter((f) => existsSync(join(live, 'out', f))).join(' ')}`, ...infos.map((i) => `${i.f}  serial ${i.serial}: ${i.resources.join(', ')}`)].join('\n'),
    'state rm only forgets: legacy.txt is still on disk. Every state command that changes the state first saves the old one as terraform.tfstate.<number>.backup. That is your undo. (The number differs on every run.)',
  );
  const backups = infos.filter((i) => i.f !== 'terraform.tfstate');
  setFact('c5.p1.legacy_file_kept', legacyKept);
  setFact('c5.p1.backup_files_count', backups.length);
  setFact('c5.p1.state_resources_after_count', infos.find((i) => i.f === 'terraform.tfstate').resources.length);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, ${useReference() ? 'reference solution' : 'starter files'}, Node ${process.versions.node}, TFC_MODE=${process.env.TFC_MODE ?? 'default'}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Resources the plan wants to destroy, before and after your state commands',
        unit: 'to destroy',
        bars: [
          { label: 'before the commands', value: s1.destroy },
          { label: 'after the commands', value: s2.destroy },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c5.p1');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  cleanup(N);
}
