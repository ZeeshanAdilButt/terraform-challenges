// Challenge 11, part 3: two pipeline runs, one lock.
// Run: node challenges/challenge-11-pipeline/part-3-two-runs-one-lock/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the solution instead of your files.
//
// It starts the teaching state server (toolkit/state-server.mjs) inside this process on port 8830, gives two
// "runners" their own copy of the code, and starts two runs of your pipeline (ci/pipeline.mjs) at nearly the same
// time against the same state. The first apply holds the lock for about thirty seconds.
//   1. the second run has no patience (LOCK_TIMEOUT=0s): it should fail at once, with the lock information
//   2. the second run waits (LOCK_TIMEOUT=120s): it should wait, then apply. Three times; the median is the fact.

import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, leftovers, assertDocker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { hostName, versionLine, mode } from '../../../toolkit/tf.js';
import { startStateServer } from '../../../toolkit/state-server.mjs';
import { barsSvg } from '../../../toolkit/bars.js';
import { median, round } from '../../../toolkit/stats.js';
import { N, terra, initWork, runNodeRetry as runNode, containerEnv, tail } from '../lib/common.mjs';

const PORT = 8830;
const STATE = 'pipeline/app';
const APP = 'tfc-c11-p3-app';
const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 11, part 3: two pipeline runs, one lock');
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareWork(import.meta.url);
const pipeline = join(work, 'ci', 'pipeline.mjs');
const events = [];
let server;

const runDir = (name) => join(work, name);
const message = () => (containerEnv(APP, 'MESSAGE=') || ['(missing)'])[0];
const stable = (t) => t.replace(/after \d+(\.\d+)?s/g, 'after Ns').replace(/ID:\s+[0-9a-f-]{36}/g, 'ID:        <id>').replace(/ID=[0-9a-f-]{36}/, 'ID=<id>').replace(/Who:\s+.*/, 'Who:       <user>@<host>').replace(/Created:\s+.*/, 'Created:   <time>');

/** Start one pipeline run in one runner folder. Resolves with { code, out, ms }. */
function startRun(dir, msg, lockTimeout, flags = {}) {
  return runNode([pipeline, dir, '--message', msg], { cwd: work, env: { LOCK_TIMEOUT: lockTimeout }, onStart: flags.onStart });
}

/** Start run A, wait until it holds the lock for its apply, then start run B. Returns both results and when B started. */
async function overlap(msgA, msgB, timeoutB) {
  let applyStarted = 0;
  const a = startRun(runDir('runA'), msgA, '0s', {
    onStart: (child) => child.stdout.setEncoding('utf8').on('data', (d) => { if (!applyStarted && /\[apply\] terraform apply/.test(d)) applyStarted = Date.now(); }),
  });
  let aDone = false;
  a.then(() => { aDone = true; });
  // B starts when the server says the apply of A holds the lock. If there never is a lock (a pipeline that does not
  // lock), B starts twelve seconds after A began its apply step.
  for (;;) {
    const info = server.lockInfo(STATE);
    if (info && /OperationTypeApply/.test(info)) break;
    if (applyStarted && Date.now() - applyStarted > 12_000) break;
    if (aDone) break;
    await sleep(150);
  }
  const from = events.length;
  const tB = Date.now();
  const b = startRun(runDir('runB'), msgB, timeoutB);
  const [ra, rb] = await Promise.all([a, b]);
  if (ra.code !== 0 && !/-lock=false/.test(readFileSync(pipeline, 'utf8')) && !/Error acquiring the state lock/.test(ra.out)) {
    throw new Error(`run A failed for a reason that is not the lock:
${ra.out.slice(0, 1500)}`);
  }
  return { ra, rb, tB, from };
}

try {
  cleanup(N);
  server = await startStateServer({ port: PORT, dir: join(work, '.state'), log: (l) => events.push({ t: Date.now(), l }) });
  rec.step(`node toolkit/state-server.mjs --port ${PORT} --dir work/.state   (started from run.mjs, in this process)`, `State server on port ${PORT}.`, 'The same teaching server as before. Every lock request is logged with its answer: 200 (you have the lock) or 423 (somebody else has it).');

  // Two runners: each pipeline run has its own checkout, its own .terraform folder, and the same state address.
  const host = hostName();
  for (const r of ['runA', 'runB']) {
    cpSync(join(work, 'infra'), runDir(r), { recursive: true });
    writeFileSync(
      join(runDir(r), 'backend.hcl'),
      `address        = "http://${host}:${PORT}/state/${STATE}"\nlock_address   = "http://${host}:${PORT}/lock/${STATE}"\nunlock_address = "http://${host}:${PORT}/lock/${STATE}"\n`,
    );
    const i = await initWork(runDir(r), ['-backend-config=backend.hcl']);
    if (i.code !== 0) throw new Error(i.out);
  }

  // 0. one run alone
  const alone = await startRun(runDir('runA'), 'base', '0s');
  const aloneS = Number((/\[apply\] ok after (\d+(?:\.\d+)?)s/.exec(alone.out) || [])[1] ?? -1);
  rec.step(
    'node ci/pipeline.mjs runA --message base',
    stable(alone.out),
    `One run on its own: init, plan, apply. The apply step includes a resource that takes 30 seconds, like a real deployment. The apply step took ${aloneS} s here (the thirty seconds of waiting plus Terraform's own work).`,
  );

  // 1. two runs, the second does not wait
  const f = await overlap('A0', 'B0', '0s');
  const lockInfoText = f.rb.out;
  const failedFast = f.rb.code !== 0 && /Error acquiring the state lock/.test(f.rb.out);
  const first423 = events.slice(f.from).find((e) => /LOCK \/lock\/.* -> 423/.test(e.l));
  const rbEnd = f.tB + f.rb.ms;
  const failAfterS = first423 ? round((first423.t - f.tB) / 1000, 1) : -1;
  rec.step(
    'run A:  LOCK_TIMEOUT=0s node ci/pipeline.mjs runA --message A0\nrun B:  LOCK_TIMEOUT=0s node ci/pipeline.mjs runB --message B0   (started while A holds the lock)',
    `--- run A (exit ${f.ra.code}) ---\n${stable(f.ra.out).split('\n').filter((l) => /ok after|FAILED|applied/.test(l)).join('\n')}\n--- run B (exit ${f.rb.code}) ---\n${stable(f.rb.out).split('\n').slice(0, 22).join('\n')}`,
    failedFast
      ? 'Run B asked for the lock, was told "locked" and stopped. Nothing was changed by B. Its error shows who holds the lock and since when. Run A carried on and finished.'
      : 'Run B did not stop. It never asked for the lock, so nothing made it wait: two runs changed the same state at the same time.',
  );
  const msgAfterFast = message();

  // 2. two runs, the second waits (three times)
  const waits = [];
  const okRuns = [];
  const finals = [];
  let sample = null;
  for (let i = 1; i <= 3; i++) {
    const w = await overlap(`A${i}`, `B${i}`, '120s');
    const e = events.slice(w.from);
    const i423 = e.findIndex((x) => /^LOCK \/lock\/.* -> 423/.test(x.l));
    const i200 = i423 >= 0 ? e.findIndex((x, k) => k > i423 && /^LOCK \/lock\/.* -> 200/.test(x.l)) : -1;
    waits.push(i423 >= 0 && i200 >= 0 ? (e[i200].t - e[i423].t) / 1000 : 0);
    okRuns.push(w.ra.code === 0 && w.rb.code === 0);
    finals.push(message() === `MESSAGE=B${i}`);
    if (i === 1) sample = w;
  }
  const waitS = round(median(waits), 1);
  rec.step(
    'run A:  node ci/pipeline.mjs runA --message A1\nrun B:  LOCK_TIMEOUT=120s node ci/pipeline.mjs runB --message B1   (started while A holds the lock)',
    `--- run A (exit ${sample.ra.code}) ---\n${stable(sample.ra.out).split('\n').filter((l) => /ok after|FAILED|applied/.test(l)).join('\n')}\n--- run B (exit ${sample.rb.code}) ---\n${stable(sample.rb.out).split('\n').filter((l) => /^\[|applied|Error/.test(l)).join('\n')}`,
    `Run B waited for run A to let go of the lock, then planned against the state A had just written and applied. Waits measured in three repetitions: ${waits.map((x) => round(x, 1)).join(' s, ')} s. Median ${waitS} s.`,
  );

  rec.step(
    'docker inspect (MESSAGE of the container), after run B of each repetition',
    `${APP}: ${message()}   (the last run to apply was B3)\nrepetitions where both runs ended with exit code 0 and B's message won: ${finals.filter(Boolean).length} of 3`,
    'The runs took turns. The last run to get the lock wrote the final state, and the state matches the container.',
  );

  // facts and a look at the log
  const denied = events.filter((e) => /^LOCK .* -> 423/.test(e.l)).length;
  const granted = events.filter((e) => /^LOCK .* -> 200/.test(e.l)).length;
  const released = events.filter((e) => /^UNLOCK /.test(e.l)).length;
  const text = readFileSync(pipeline, 'utf8');
  setFact('c11.p3.alone_apply_s', aloneS);
  setFact('c11.p3.fast_fail_exit_code', f.rb.code);
  setFact('c11.p3.fast_fail_error_text', failedFast ? 'Error acquiring the state lock' : 'did not fail');
  setFact('c11.p3.fast_fail_shows_lock_info', /Lock Info:/.test(lockInfoText) && /Operation:\s+OperationTypeApply/.test(lockInfoText));
  setFact('c11.p3.fast_fail_after_s', failAfterS);
  setFact('c11.p3.fast_fail_first_run_ok', f.ra.code === 0);
  setFact('c11.p3.wait_median_s', waitS);
  setFact('c11.p3.wait_min_s', round(Math.min(...waits), 1));
  setFact('c11.p3.wait_max_s', round(Math.max(...waits), 1));
  setFact('c11.p3.waited_runs_ok_count', okRuns.filter(Boolean).length);
  setFact('c11.p3.final_state_is_second_count', finals.filter(Boolean).length);
  setFact('c11.p3.lock_denied_count', denied);
  setFact('c11.p3.lock_granted_count', granted);
  setFact('c11.p3.unlock_count', released);
  setFact('c11.p3.pipeline_has_lock_false', /-lock=false/.test(text));
  setFact('c11.p3.pipeline_has_lock_timeout', /-lock-timeout/.test(text));

  const destroy = await terra(runDir('runA'), ['destroy', '-auto-approve', '-input=false'], { initArgs: ['-backend-config=backend.hcl'] });
  await server.close();
  server = null;
  const left = leftovers(N);
  setFact('c11.p3.leftover_count', left.containers + left.networks + left.volumes);
  rec.step(
    `cd runA && terraform destroy -auto-approve
docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=${N})`,
    `${tail(destroy.out, 1)}
${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes`,
    'The part ends with a destroy, which takes the lock like any other run. The state server is stopped.',
  );
  cleanup(N);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, ${versionLine()} (${mode()} mode), Node ${process.versions.node}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Second pipeline run: no wait versus waiting for the lock',
        unit: 's',
        bars: [
          { label: 'One apply, alone', value: aloneS },
          { label: 'Second run, no wait: time to the error', value: Math.max(failAfterS, 0) },
          { label: 'Second run, waits: time waiting for the lock', value: waitS },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c11.p3');
} catch (e) {
  console.error(`\nStopped: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  if (server) await server.close();
  cleanup(N);
}
