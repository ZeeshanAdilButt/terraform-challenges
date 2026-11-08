// Challenge 4, part 2: the graph and the order.
// Run: node challenges/challenge-4-lock-file-and-graph/part-2-the-graph-and-order/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the reference solution instead of your files.
//
// Three small configurations, each in its own folder of work/:
//   cycle/     two resources that need each other (Terraform refuses it)
//   ordering/  a database, the migrations and the seed data (your depends_on fix); faults/ordering is the original
//   reads/     a file and a data source that reads it back (your depends_on fix); faults/reads is the original

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tf } from '../../../toolkit/tf.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { cleanup } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, applyEvents, at, clean, initRetry, parseGraph, tfRetry } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 4, part 2: the graph and the order');
const work = prepareWork(import.meta.url);

const compact = (out) => clean(out).split('\n').map((l) => l.trimEnd()).filter(Boolean);
const lineMatching = (out, re) => compact(out).filter((l) => re.test(l));
const edgesText = (edges) => edges.map((e) => `${e.from} needs ${e.to}`).join('\n') || '(no edges)';
const EVENT_LINE = /^\S+: (Creating|Creation complete|Destroying|Destruction complete|Reading|Read complete)\b/;

function graphOf(dir) {
  initRetry(dir);
  const g = tfRetry(['graph'], { cwd: dir });
  return parseGraph(g.stdout);
}

/** True when, for every edge "from needs to", "to" finished before "from" started. */
function everyEdgeRespected(edges, events) {
  return edges.every((e) => {
    const done = at(events, e.to, 'done');
    const start = at(events, e.from, 'start');
    return done >= 0 && start >= 0 && done < start;
  });
}

try {
  cleanup(N);

  // Step 1: a cycle.
  const cycleDir = join(work, 'cycle');
  initRetry(cycleDir);
  const cyc = tfRetry(['validate'], { cwd: cycleDir });
  const cycleLine = compact(cyc.out).join(' ').match(/Cycle: .*/)?.[0] ?? '';
  rec.step(
    'terraform validate     (in cycle/)',
    compact(cyc.out).join('\n') + `\n[exit code ${cyc.code}]`,
    'A resource cannot wait for something that waits for it. Terraform finds this before it touches anything.',
  );
  setFact('c4.p2.cycle_validate_exit_code', cyc.code);
  setFact('c4.p2.cycle_error_line', cycleLine || 'none');

  // Step 2: the original ordering, with its missing depends_on.
  const faultDir = join(work, 'faults', 'ordering');
  const faultEdges = graphOf(faultDir);
  rec.step(
    'terraform graph     (original ordering/main.tf, edges only)',
    edgesText(faultEdges),
    'One edge: seed needs migrate, because seed reads migrate\'s id. Nothing says migrate needs the database. "A needs B" means B is built first.',
  );
  const faultApply = tfRetry(['apply', '-auto-approve'], { cwd: faultDir });
  const faultEvents = applyEvents(clean(faultApply.out));
  const migrateBeforeDb = at(faultEvents, 'terraform_data.migrate', 'done') < at(faultEvents, 'time_sleep.database_ready', 'done');
  rec.step(
    'terraform apply -auto-approve     (original, default parallelism of 10)',
    lineMatching(faultApply.out, EVENT_LINE).join('\n'),
    migrateBeforeDb
      ? 'The migrations finished before the database was ready. No error, no warning, and the plan looked fine: with no edge, Terraform starts both at once (up to 10 at a time) and the 2 second wait does not hold migrate back.'
      : 'Here Terraform happened to finish the database first, but only by luck. Nothing in the files promises it.',
  );
  setFact('c4.p2.fault_edge_count', faultEdges.length);
  setFact('c4.p2.fault_migrate_before_database', migrateBeforeDb);
  setFact('c4.p2.fault_migrate_needs_database_edge', faultEdges.some((e) => e.from === 'terraform_data.migrate' && e.to === 'time_sleep.database_ready'));
  tf(['destroy', '-auto-approve'], { cwd: faultDir });

  // Step 3: your ordering.
  const dir = join(work, 'ordering');
  const edges = graphOf(dir);
  rec.step('terraform graph     (your ordering/main.tf, edges only)', edgesText(edges), 'Now migrate needs the database. depends_on adds an edge, like a reference does, without passing a value.');
  const ap = tfRetry(['apply', '-auto-approve', '-parallelism=1'], { cwd: dir });
  const events = applyEvents(clean(ap.out));
  const respected = everyEdgeRespected(edges, events);
  rec.step('terraform apply -auto-approve -parallelism=1     (yours)', lineMatching(ap.out, EVENT_LINE).join('\n'), 'Every "needs" line above is respected: the thing needed completes before the thing that needs it starts.');
  setFact('c4.p2.edge_count', edges.length);
  setFact('c4.p2.edges_respected', respected);
  setFact('c4.p2.migrate_needs_database_edge', edges.some((e) => e.from === 'terraform_data.migrate' && e.to === 'time_sleep.database_ready'));
  setFact('c4.p2.migrate_after_database', at(events, 'terraform_data.migrate', 'start') > at(events, 'time_sleep.database_ready', 'done'));

  // Step 4: destroy runs the graph backwards.
  const de = tfRetry(['destroy', '-auto-approve', '-parallelism=1'], { cwd: dir });
  const dEvents = applyEvents(clean(de.out));
  const destroyReversed = dEvents.length > 0 && edges.every((e) => at(dEvents, e.from, 'done') < at(dEvents, e.to, 'start'));
  rec.step('terraform destroy -auto-approve -parallelism=1     (yours)', lineMatching(de.out, EVENT_LINE).join('\n'), 'Destroy runs the same graph backwards: what needs something is removed before the thing it needs.');
  setFact('c4.p2.destroy_reverses_order', destroyReversed);

  // Step 5: a data source that reads too early.
  const readsFault = join(work, 'faults', 'reads');
  initRetry(readsFault);
  const rf = tfRetry(['plan'], { cwd: readsFault });
  const readErr = compact(rf.out).find((l) => /Original Error/.test(l)) ?? '';
  const readOutput = compact(rf.out).filter((l) => /^data\.|Error|Original Error|Plan:|cannot be read/.test(l)).join('\n');
  rec.step('terraform plan     (original reads/main.tf, no file yet)', `${readOutput}\n[exit code ${rf.code}]`, 'Nothing links the data source to the resource that writes the file, so Terraform reads it during the plan. The file is not there yet.');
  setFact('c4.p2.reads_fault_plan_exit_code', rf.code);
  setFact('c4.p2.reads_fault_error_line', readErr.replace(/^\+?Original Error: /, '') || 'none');

  const readsDir = join(work, 'reads');
  initRetry(readsDir);
  const rp = tfRetry(['plan'], { cwd: readsDir });
  const rapply = tfRetry(['apply', '-auto-approve'], { cwd: readsDir });
  rec.step(
    'terraform plan, then terraform apply -auto-approve     (yours)',
    [...compact(rp.out).filter((l) => /^data\.|will be read during apply|^Plan:/.test(l)), ...compact(rapply.out).filter((l) => /^data\.|^local_file|Apply complete|settings =/.test(l)), `[plan exit code ${rp.code}, apply exit code ${rapply.code}]`].join('\n'),
    'With depends_on the read waits: the plan says "read during apply", and the apply reads the file after it is written.',
  );
  setFact('c4.p2.reads_plan_exit_code', rp.code);
  setFact('c4.p2.reads_apply_exit_code', rapply.code);
  setFact('c4.p2.reads_value_read', /region=eu/.test(rapply.out));
  tf(['destroy', '-auto-approve'], { cwd: readsDir });
  tf(['destroy', '-auto-approve'], { cwd: readsFault });

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, ${useReference() ? 'reference solution' : 'starter files'}, Node ${process.versions.node}, TFC_MODE=${process.env.TFC_MODE ?? 'default'}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Edges in the dependency graph (A needs B)',
        unit: 'edges',
        bars: [
          { label: 'original, migrate without depends_on', value: faultEdges.length },
          { label: 'yours, with depends_on', value: edges.length },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c4.p2');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  cleanup(N);
}
