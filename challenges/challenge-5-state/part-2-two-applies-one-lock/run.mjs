// Challenge 5, part 2: two applies, one lock.
// Run: node challenges/challenge-5-state/part-2-two-applies-one-lock/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the reference solution instead of your files.
//
// It starts the toolkit's state server on port 8810 (inside this Node process), so every Terraform call here
// is asynchronous: tf() would block the process and the server could not answer.
//   1. faults/backend.hcl (no lock addresses): two applies at once, both run.
//   2. your backend.hcl: the second apply is refused; -lock-timeout waits; a stale lock; force-unlock.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tfAsync, hostName } from '../../../toolkit/tf.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { cleanup, waitFor } from '../../../toolkit/docker.js';
import { startStateServer } from '../../../toolkit/state-server.mjs';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, initAsync, lines, pick, sleep, tfAsyncRetry } from '../lib.mjs';

const PORT = 8810;
const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 5, part 2: two applies, one lock');
const work = prepareWork(import.meta.url);
const server = await startStateServer({ port: PORT, dir: join(work, 'server-state') });

/** Make one checkout (a folder with main.tf and a backend.hcl filled in from a template) and init it against the state server. */
async function checkout(name, who, templatePath) {
  const dir = join(work, `${name}-${who}`);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(work, 'main.tf'), join(dir, 'main.tf'));
  const text = readFileSync(templatePath, 'utf8').replaceAll('@HOST@', hostName()).replaceAll('@PORT@', String(PORT)).replaceAll('@NAME@', name);
  writeFileSync(join(dir, 'backend.hcl'), text);
  const init = ['init', '-backend-config=backend.hcl'];
  const r = await initAsync(dir, init);
  if (r.code !== 0) throw new Error(`init failed in ${dir}:
${r.out}`);
  return { dir, init, initOut: r.out, run: (args) => tfAsyncRetry(args, { cwd: dir, initArgs: init }) };
}
/** Two engineers, two checkouts, one state name. */
async function pair(name, templatePath) {
  return { a: await checkout(name, 'alice', templatePath), b: await checkout(name, 'bob', templatePath) };
}
const seconds = (ms) => Math.round(ms / 100) / 10;
const denied = () => server.events.filter((e) => e.method === 'LOCK' && e.code === 423).length;
const lockRequests = () => server.events.filter((e) => e.method === 'LOCK').length;

try {
  cleanup(N);

  // Step 1: no lock addresses. Two applies at once.
  const { a: ua, b: ub } = await pair('unlocked', join(work, 'faults', 'backend.hcl'));
  rec.step('terraform init -backend-config=backend.hcl     (original backend.hcl: an address, no lock addresses)', pick(ua.initOut, /Successfully configured the backend/), 'The state is kept on the state server. Nothing here says the state can be locked.');
  const first = ua.run(['apply', '-auto-approve']);
  await sleep(4000);
  const second = ub.run(['apply', '-auto-approve']);
  const [a1, a2] = await Promise.all([first, second]);
  const done = (r) => pick(r.out, /^Apply complete|^Error/);
  rec.step(
    'alice and bob each run terraform apply -auto-approve, bob 4 seconds after alice     (original)',
    `first apply:  ${done(a1)}\nsecond apply: ${done(a2)}\nlock requests that reached the server: ${lockRequests()}`,
    'Both applies ran, both created the resource from the same empty state, and the last one to finish overwrote the state of the other. Nobody was told.',
  );
  setFact('c5.p2.unlocked_apply_complete_count', [a1, a2].filter((r) => /Apply complete! Resources: 1 added/.test(r.out)).length);
  setFact('c5.p2.unlocked_lock_requests_count', lockRequests());
  await ua.run(['destroy', '-auto-approve']);

  // Step 2: with lock addresses. The same two applies.
  const { a: la, b: lb } = await pair('locked', join(work, 'backend.hcl'));
  rec.step('terraform init -backend-config=backend.hcl     (your backend.hcl)', pick(la.initOut, /Successfully configured the backend/), 'Same server, a different state name. Does your backend.hcl have lock_address and unlock_address?');
  const before = denied();
  const slow = la.run(['apply', '-auto-approve']);
  let lockInfo = null;
  try {
    await waitFor(() => server.isLocked('locked'), { timeoutMs: 60_000, what: 'the first apply to take the lock' });
    lockInfo = JSON.parse(server.lockInfo('locked'));
  } catch (e) {
    if (process.env.TFC_DEBUG) console.error('DEBUG waitFor failed:', e.message, JSON.stringify(server.events.slice(-12)));
    /* no lock: the learner's backend.hcl does not lock; the steps below say so */
  }
  rec.step('(while the apply of alice runs) what the state server holds as the lock', lockInfo ? Object.entries(lockInfo).map(([k, v]) => `${k}: ${v}`).join('\n') : 'no lock was taken: the state server never saw a LOCK request', lockInfo ? 'The lock is a small record: who, what, since when. Terraform took it by itself, before it read the state.' : 'Without lock_address and unlock_address Terraform never asks for a lock.');
  setFact('c5.p2.first_apply_took_lock', lockInfo !== null);

  await sleep(1500);
  const refused = await lb.run(['apply', '-auto-approve']);
  const errLines = lines(refused.out);
  const idMatch = /ID=([0-9a-f-]{36})/.exec(refused.out);
  rec.step('terraform apply -auto-approve     (bob, while alice runs)', `${errLines.slice(0, 18).join('\n')}\n[exit code ${refused.code}]`, refused.code !== 0 ? 'Refused before it read or changed anything. The error names the lock, who holds it, since when, and its ID.' : 'The second apply was not refused. Check lock_address and unlock_address in backend.hcl.');
  setFact('c5.p2.second_apply_exit_code', refused.code);
  setFact('c5.p2.second_apply_lock_error', /Error acquiring the state lock/.test(refused.out));
  setFact('c5.p2.lock_error_line', pick(refused.out, /HTTP remote state already locked/) || 'none');
  setFact('c5.p2.lock_info_who_known', /Who:\s+\S+/.test(refused.out));

  const t0 = Date.now();
  const timed = await lb.run(['apply', '-auto-approve', '-lock-timeout=5s']);
  const shortWait = Date.now() - t0;
  rec.step('terraform apply -auto-approve -lock-timeout=5s     (bob again, alice still running)', `${pick(timed.out, /^Acquiring state lock|^Error: Error acquiring|already locked/)}\n[exit code ${timed.code}, took ${seconds(shortWait)} s including the container start]`, 'With -lock-timeout Terraform keeps retrying for that long, then gives up with the same error. The default is 0s: give up at once.');
  setFact('c5.p2.lock_timeout_short_exit_code', timed.code);
  setFact('c5.p2.lock_timeout_short_waited_s', seconds(shortWait));

  const t1 = Date.now();
  const patient = await lb.run(['apply', '-auto-approve', '-lock-timeout=120s']);
  const longWait = Date.now() - t1;
  rec.step('terraform apply -auto-approve -lock-timeout=120s     (bob again, alice still running)', `${pick(patient.out, /^Acquiring state lock|^No changes|^Apply complete|^Error/)}\n[exit code ${patient.code}, waited ${seconds(longWait)} s]`, 'It waited until the first apply released the lock, then ran. It found the resource already there, so it changed nothing. A pipeline that must not fail on a busy lock uses a timeout.');
  setFact('c5.p2.lock_timeout_long_exit_code', patient.code);
  setFact('c5.p2.lock_timeout_long_waited_s', seconds(longWait));
  setFact('c5.p2.lock_timeout_long_no_changes', /No changes/.test(patient.out));
  const firstResult = await slow;
  rec.step('(the apply of alice, at the end)', pick(firstResult.out, /^time_sleep|^Apply complete|^Error/), 'The first apply was never disturbed. The lock is released when it ends.');
  setFact('c5.p2.first_apply_exit_code', firstResult.code);
  setFact('c5.p2.lock_denied_count', denied() - before);
  setFact('c5.p2.lock_released_after_apply', !server.isLocked('locked'));

  // Step 3: a stale lock and force-unlock.
  const stale = { ID: '5b0b3c40-6d3e-4a7e-9f11-0a1b2c3d4e5f', Operation: 'OperationTypeApply', Info: '', Who: 'ci-runner@build-42', Version: '1.17.1', Created: new Date().toISOString(), Path: '' };
  await fetch(`http://127.0.0.1:${PORT}/lock/locked`, { method: 'LOCK', body: JSON.stringify(stale) });
  const blocked = await lb.run(['plan']);
  const staleId = /ID=([0-9a-f-]{36})/.exec(blocked.out)?.[1];
  rec.step(
    'terraform plan     (a CI job was killed halfway and left its lock behind)',
    `${errLines.length ? lines(blocked.out).slice(0, 14).join('\n') : ''}\n[exit code ${blocked.code}]`,
    'Nothing is running, yet the lock is held. This is a stale lock. Before you force it open: check that the Who and Created lines really belong to a dead job.',
  );
  setFact('c5.p2.stale_lock_blocks_plan', blocked.code !== 0);
  const fu = await lb.run(['force-unlock', '-force', staleId ?? 'unknown']);
  rec.step(`terraform force-unlock -force ${staleId ?? '<ID>'}`, `${lines(fu.out).join('\n')}\n[exit code ${fu.code}]`, 'force-unlock takes the ID from the error. It removes the lock. It does not touch your infrastructure and it does not fix a half-written state.');
  setFact('c5.p2.force_unlock_exit_code', fu.code);
  const again = await lb.run(['plan']);
  rec.step('terraform plan', lines(again.out).filter((l2) => /^No changes|^Plan:|^Error/.test(l2)).join('\n'), 'The lock is gone and plans work again.');
  setFact('c5.p2.plan_after_force_unlock_exit_code', again.code);
  await la.run(['destroy', '-auto-approve']);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, ${useReference() ? 'reference solution' : 'starter files'}, Node ${process.versions.node}, TFC_MODE=${process.env.TFC_MODE ?? 'default'}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Seconds a second apply waited for the lock',
        unit: 's',
        bars: [
          { label: 'default (0s)', value: 0 },
          { label: '-lock-timeout=5s', value: seconds(shortWait) },
          { label: '-lock-timeout=120s', value: seconds(longWait) },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c5.p2');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  await server.close();
  cleanup(N);
}
