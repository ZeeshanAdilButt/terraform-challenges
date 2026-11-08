// Challenge 14, part 4: the defence.
// Run: node challenges/challenge-14-capstone/part-4-the-defence/run.mjs
// Add --record to also write results.md. Add --reference (or TFC_REFERENCE=1) to run the solution.
//
// It runs the checks the rubric of the checker is built on, over your whole capstone, and prints the checklist by
// rubric area. It also runs the Docker-free test that CI runs on every push (capstone.test.mjs) as its own process.
// Nothing here grades how well you wrote: it looks for the pieces a reviewer must find (headings, the real error
// lines, a link, pinned commits). The five-minute recording is yours to make.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Recorder } from '../../../toolkit/record.js';
import { recording, useReference } from '../../../toolkit/part.js';
import { HERE, prepareCapstone, saveFacts, short } from '../lib.mjs';
import { allChecks, defenceChecks, runbookChecks } from '../shape.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 14, part 4: the defence');
const work = prepareCapstone(import.meta.url, 4);

const checks = allChecks(work);
const areas = ['module', 'envs', 'tests', 'gate', 'workflow', 'runbook', 'defence'];
const facts = {
  checklist_total_count: checks.length,
  checklist_passed_count: checks.filter((c) => c.ok).length,
  runbook_failing_count: runbookChecks(work).filter((c) => !c.ok).length,
  defence_failing_count: defenceChecks(work).filter((c) => !c.ok).length,
  ci_tests_pass_count: -1,
  ci_tests_fail_count: -1,
};

const table = areas.map((a) => {
  const mine = checks.filter((c) => c.area === a);
  return `${a.padEnd(9)} ${String(mine.filter((c) => c.ok).length).padStart(2)} of ${String(mine.length).padEnd(2)} ${mine.every((c) => c.ok) ? 'ok' : 'MISSING'}`;
});
rec.step(
  'node challenges/challenge-14-capstone/part-4-the-defence/run.mjs   (the checklist, by rubric area)',
  table.join('\n'),
  facts.checklist_passed_count === facts.checklist_total_count ? 'Every piece a reviewer looks for is there.' : 'Pieces are missing. The next step says what to change.',
);
const missing = checks.filter((c) => !c.ok);
if (missing.length) {
  rec.step('what is missing', short(missing.map((c) => `${c.area}/${c.id}: ${c.message}`).join('\n'), 25), 'Fix these, then run this again.');
}

// The Docker-free test that CI runs on every push, as its own process, pointed at the work copy.
const r = spawnSync(process.execPath, ['--test', join(HERE, 'capstone.test.mjs')], { encoding: 'utf8', env: { ...process.env, TFC_CAPSTONE_ROOT: work }, timeout: 120_000 });
const out = `${r.stdout}${r.stderr}`;
facts.ci_tests_pass_count = Number(/^# pass (\d+)/m.exec(out)?.[1] ?? -1);
facts.ci_tests_fail_count = Number(/^# fail (\d+)/m.exec(out)?.[1] ?? -1);
rec.step(
  'node --test challenges/challenge-14-capstone/capstone.test.mjs   (what .github/workflows/ci.yml runs on every push)',
  `tests ${facts.ci_tests_pass_count + facts.ci_tests_fail_count}, pass ${facts.ci_tests_pass_count}, fail ${facts.ci_tests_fail_count}`,
  facts.ci_tests_fail_count === 0 ? 'The same checks, run by CI on GitHub, are what the checker reads on the commit you tag: a green run is the evidence. The checker never runs your code itself.' : 'CI would be red on this commit.',
);

rec.step(
  'before you tag',
  [
    '1. The repository is public.',
    '2. DEFENCE.md has the link to your recording, and it opens without a login.',
    '3. CI is green on the commit you want graded (the Actions tab).',
    '4. git tag capstone-v1 && git push origin capstone-v1',
  ].join('\n'),
  'Only GitHub can show points 1 to 3. This script cannot: it never reaches GitHub.',
);

saveFacts('c14.p4', facts);
if (recording() && useReference()) {
  rec.write(join(here, 'results.md'), `${process.platform}, Node ${process.versions.node}, no Docker needed`);
  console.log('\nWrote results.md');
}
console.log('\nSee your numbers with: node toolkit/show-facts.mjs c14.p4');
