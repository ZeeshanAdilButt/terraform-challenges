// Challenge 9, part 3: keeping logs clean.
// Run: node challenges/challenge-9-secrets/part-3-clean-logs/run.mjs
// Add --record to also write results.md. Use --reference (or TFC_REFERENCE=1) to run the solution instead of your files.
//
// It plays a CI job twice: once on your main.tf and once on a stack that is known to leak (fixtures/leaky).
// Each build runs init, plan, apply, keeps the plan text, the apply text, the plan as JSON and the state, and then
// runs ci.mjs, which uses your scan.mjs to look for the fake token. The run also searches the same files with a
// plain text search of its own, so it knows the truth even when your scanner is wrong.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { mode } from '../../../toolkit/tf.js';
import { errorBlock, grep, initPlain, runPlain, saveFacts, short } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 9, part 3: keeping logs clean');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });

// Clearly fake. The / + = characters make its URL form and its base64 form differ from the plain text.
const SECRET = 'fake/api+token=not-a-real-secret';
const env = { TF_VAR_api_token: SECRET };

const facts = {
  learner_build_ok: false,
  learner_truth_leak_places_count: -1,
  learner_ci_exit_code: -1,
  fixture_build_ok: false,
  fixture_truth_leak_places_count: -1,
  fixture_ci_exit_code: -1,
  ci_prints_secret: true,
};
const save = () => saveFacts('c9.p3', facts);

const yn = (b) => (b ? 'YES' : 'no');
let printed = false;

/** One CI build in a folder. Returns what was kept, what is really in it, and what ci.mjs said. */
async function build(dir, label) {
  mkdirSync(join(dir, 'logs'), { recursive: true });
  const i = await initPlain(dir);
  if (i.code !== 0) return { ok: false, why: `init failed:\n${errorBlock(i.out, 6)}` };
  const p = runPlain(['plan', '-out=tfplan'], dir, env);
  writeFileSync(join(dir, 'logs', 'plan.txt'), p.out);
  if (p.code !== 0) return { ok: false, why: `plan failed:\n${errorBlock(p.out, 8)}` };
  const pj = runPlain(['show', '-json', 'tfplan'], dir, env);
  writeFileSync(join(dir, 'logs', 'plan.json'), pj.stdout);
  const a = runPlain(['apply', 'tfplan'], dir, env);
  writeFileSync(join(dir, 'logs', 'apply.txt'), a.out);
  if (a.code !== 0) return { ok: false, why: `apply failed:\n${errorBlock(a.out, 8)}` };

  const files = ['logs/plan.txt', 'logs/plan.json', 'logs/apply.txt', 'terraform.tfstate'];
  const truth = files.map((f) => ({ f, leaks: existsSync(join(dir, f)) && readFileSync(join(dir, f), 'utf8').includes(SECRET) }));
  const ci = spawnSync(process.execPath, [join(work, 'ci.mjs'), '--secret-env', 'API_TOKEN', ...files], { cwd: dir, env: { ...process.env, API_TOKEN: SECRET }, encoding: 'utf8' });
  const ciOut = `${ci.stdout}${ci.stderr}`.trim();
  const b64 = Buffer.from(SECRET).toString('base64');
  if (ciOut.includes(SECRET) || ciOut.includes(b64) || ciOut.includes(encodeURIComponent(SECRET))) printed = true;
  runPlain(['destroy', '-auto-approve'], dir, env);
  const view = short(
    [
      'what is really in each file (plain text search by run.mjs):',
      ...truth.map((t) => `  ${t.f.padEnd(18)} ${yn(t.leaks)}`),
      'what ci.mjs said:',
      ...ciOut.split('\n').map((l) => `  ${l}`),
      `ci exit code: ${ci.status}`,
    ].join('\n'),
  );
  const command = `CI build of ${label}: terraform plan, terraform apply, then  node ci.mjs --secret-env API_TOKEN ${files.join(' ')}`;
  return { ok: true, truth, code: ci.status ?? -1, view, command };
}

async function main() {
  const learner = await build(work, 'your main.tf');
  if (!learner.ok) return stop(learner.why);
  facts.learner_build_ok = true;
  facts.learner_truth_leak_places_count = learner.truth.filter((t) => t.leaks).length;
  facts.learner_ci_exit_code = learner.code;
  rec.step(
    learner.command,
    learner.view,
    learner.code === 0 && facts.learner_truth_leak_places_count > 0
      ? 'The build is GREEN and the token is in the files above. The scanner found nothing because it cannot find anything yet. A green scan that has never failed proves nothing.'
      : learner.code === 0
        ? 'Green, and the files are really clean.'
        : 'ci.mjs failed the build: it names the files and lines, never the secret itself.',
  );

  const fixture = await build(join(work, 'fixtures', 'leaky'), 'fixtures/leaky (a stack known to leak)');
  if (!fixture.ok) return stop(fixture.why);
  facts.fixture_build_ok = true;
  facts.fixture_truth_leak_places_count = fixture.truth.filter((t) => t.leaks).length;
  facts.fixture_ci_exit_code = fixture.code;
  rec.step(
    fixture.command,
    fixture.view,
    fixture.code === 1
      ? `The scanner fails the build on the leaky stack: ${facts.fixture_truth_leak_places_count} files hold the token, and ci.mjs reports where. It also finds forms the plain search of this run does not (url, base64) if they appear.`
      : 'The leaky stack passed the scan. The scanner is not finding what is there.',
  );
  facts.ci_prints_secret = printed;
}

function stop(why) {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
}

try {
  save();
  await main();
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  save();
  if (recording() && useReference()) {
    rec.write(join(here, 'results.md'), `${process.platform}, runner ${mode()}, Terraform 1.17.1 in the pinned image, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c9.p3');
}
