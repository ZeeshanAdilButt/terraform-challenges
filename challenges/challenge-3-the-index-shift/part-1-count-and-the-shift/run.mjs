// Challenge 3, part 1: count and the index shift.
// Run: node challenges/challenge-3-the-index-shift/part-1-count-and-the-shift/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
//
// It applies five files made with count, then plans five changes to the list of names (each from the same
// starting state, never applied), scores your predictions, and finally applies one of the changes for real.
// Only the local provider is used. Everything is written under work/out/.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { barsSvg } from '../../../toolkit/bars.js';
import { setFact } from '../../../toolkit/facts.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { Recorder } from '../../../toolkit/record.js';
import { applyCounts, mode, planCounts } from '../../../toolkit/tf.js';
import { errorBlock, planLines, tfx, touched } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 3, part 1: count and the index shift');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });
const opts = { cwd: work };

const BASE = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
// The first three are predicted. The last two are shown for comparison.
const SCENARIOS = [
  { key: 'remove_first', label: 'remove the first', what: 'remove "alpha", the first name', names: ['bravo', 'charlie', 'delta', 'echo'], predicted: true },
  { key: 'remove_middle', label: 'remove the middle', what: 'remove "charlie", the middle name', names: ['alpha', 'bravo', 'delta', 'echo'], predicted: true },
  { key: 'remove_last', label: 'remove the last', what: 'remove "echo", the last name', names: ['alpha', 'bravo', 'charlie', 'delta'], predicted: true },
  { key: 'reverse', label: 'reverse the order', what: 'reverse the order of the five names', names: [...BASE].reverse(), predicted: false },
  { key: 'insert_front', label: 'insert at the front', what: 'insert "zulu" in front of the five names', names: ['zulu', ...BASE], predicted: false },
];
const varArg = (names) => ['-var', `names=${JSON.stringify(names)}`];

try {
  const predictions = JSON.parse(readFileSync(join(work, 'predictions.json'), 'utf8'));
  const init = tfx(['init'], opts);
  if (init.code !== 0) throw new Error(`terraform init failed:\n${init.out}`);

  // Step 1: the baseline.
  const apply0 = tfx(['apply', '-auto-approve'], opts);
  const a0 = applyCounts(apply0.out);
  if (!a0) throw new Error(`The baseline apply failed:\n${apply0.out}`);
  const files0 = readdirSync(join(work, 'out')).sort();
  rec.step(
    'terraform apply -auto-approve   (five names: alpha, bravo, charlie, delta, echo)',
    `${apply0.out.split('\n').filter((l) => /Apply complete/.test(l)).join('\n')}\nfiles in out/: ${files0.join(' ')}`,
    'Five resources, addressed local_file.item[0] to local_file.item[4]. With count, the address is the position in the list. The name is only a value inside.',
  );

  // Steps 2 to 6: change the list, plan only.
  const results = [];
  for (const s of SCENARIOS) {
    const p = tfx(['plan', ...varArg(s.names)], opts);
    const c = planCounts(p.out);
    const ok = c !== null;
    const want = predictions[s.key] ?? {};
    const match = ok && want.add === c.add && want.change === c.change && want.destroy === c.destroy;
    results.push({ ...s, ok, ...(c ?? { add: -1, change: -1, destroy: -1 }), match, touches: touched(p.out) });
    const said = want.add == null ? 'no prediction yet' : `${want.add} add, ${want.change} change, ${want.destroy} destroy`;
    rec.step(
      `terraform plan -var 'names=${JSON.stringify(s.names)}'   (${s.what}; resource lines and the Plan line)`,
      ok ? `${planLines(p.out)}${s.predicted ? `\nYour prediction: ${said}\nResult: ${match ? 'matches' : 'does not match'}` : ''}` : errorBlock(p.out, 12),
      !ok
        ? 'The plan fails. The count is not following the list: a number written by hand cannot follow a list that changed. Use length(var.names).'
        : s.key === 'remove_first'
          ? 'Every name moved one position to the left. Position 0 now holds "bravo", so item[0] gets new content and is replaced; the same for 1, 2 and 3. Position 4 has no name any more and is destroyed.'
          : s.key === 'remove_middle'
            ? 'Positions 0 and 1 are unchanged. "delta" moved into position 2 and "echo" into position 3, so those two are replaced. Position 4 is destroyed. You asked to remove one file and Terraform destroys three.'
            : s.key === 'remove_last'
              ? 'Nothing moved. Only the last position goes. Removing from the end of a count list is the one safe edit.'
              : s.key === 'reverse'
                ? 'Same names, new order, and four of five are replaced. For count, order is identity.'
                : 'Adding at the front shifts everything: five replaced and one new.',
    );
  }

  // Step 7: apply the middle removal for real.
  const mid = SCENARIOS.find((s) => s.key === 'remove_middle');
  const applyMid = tfx(['apply', '-auto-approve', ...varArg(mid.names)], opts);
  const am = applyCounts(applyMid.out);
  const files1 = existsSync(join(work, 'out')) ? readdirSync(join(work, 'out')).sort() : [];
  rec.step(
    `terraform apply -auto-approve -var 'names=["alpha","bravo","delta","echo"]'   (remove "charlie" for real)`,
    am
      ? `${applyMid.out.split('\n').filter((l) => /Apply complete|Destroying\.\.\.|Creating\.\.\./.test(l)).join('\n')}\nfiles in out/: ${files1.join(' ')}`
      : errorBlock(applyMid.out, 12),
    'The three destroys and two creates really happen. The files were rewritten: with real resources (a database, a container), this is data loss and downtime for things you meant to keep.',
  );

  // Facts.
  setFact('c3.p1.baseline_added_count', a0.added);
  for (const r of results) {
    setFact(`c3.p1.${r.key}_plan_ok`, r.ok);
    setFact(`c3.p1.${r.key}_add_count`, r.add);
    setFact(`c3.p1.${r.key}_change_count`, r.change);
    setFact(`c3.p1.${r.key}_destroy_count`, r.destroy);
    setFact(`c3.p1.${r.key}_touched_count`, r.touches.length);
    if (r.predicted) setFact(`c3.p1.${r.key}_prediction_matches`, r.match);
  }
  setFact('c3.p1.predictions_correct_count', results.filter((r) => r.predicted && r.match).length);
  setFact('c3.p1.middle_apply_added_count', am?.added ?? -1);
  setFact('c3.p1.middle_apply_destroyed_count', am?.destroyed ?? -1);
  setFact('c3.p1.files_after_middle_apply_count', files1.length);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, runner mode ${mode()}, Node ${process.versions.node}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Resources destroyed by one edit to a count list of five',
        unit: 'destroyed',
        bars: results.map((r) => ({ label: r.label, value: Math.max(0, r.destroy) })),
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  const ok = results.filter((r) => r.predicted && r.match).length;
  console.log(`\nYou predicted ${ok} of 3 plans. See your numbers with: node toolkit/show-facts.mjs c3.p1`);
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
}
