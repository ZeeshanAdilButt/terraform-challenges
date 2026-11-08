// Challenge 8, part 2: mock_provider, and what a mock cannot tell you.
// Run: node challenges/challenge-8-tests-and-gate/part-2-mock-provider/run.mjs
// Add --record to also write results.md. Use --reference (or TFC_REFERENCE=1) to run the solution instead of your files.
//
// It runs your mocked tests with NO Docker socket mounted, shows that a real plan cannot work that way, then lets the
// mocked tests and a real apply disagree on purpose: a container with the same name already exists.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, label, leftovers, name, run as docker } from '../../../toolkit/docker.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { mode } from '../../../toolkit/tf.js';
import { N, errorBlock, firstMatch, grep, initPlain, run, runPlain, saveFacts, short } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 8, part 2: mock_provider, and what a mock cannot tell you');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });
const MOCK_IP = '10.0.0.5';

const facts = {
  init_ok: false,
  test_block_count: 0,
  test_passed_count: 0,
  test_failed_count: 0,
  apply_without_docker_fails: false,
  real_apply_conflict: false,
  real_apply_after_removal_ok: false,
  real_ip_differs_from_mock: false,
  destroyed_count: 0,
  leftover_count: -1,
};
const save = () => saveFacts('c8.p2', facts);

function summary(text) {
  const m = /(?:Success|Failure)! (\d+) passed, (\d+) failed/.exec(text);
  return m ? { passed: +m[1], failed: +m[2] } : { passed: 0, failed: 0 };
}

function testView(text, maxErrorLines = 8) {
  const head = text.split('\n').filter((l) => /^  run "|^(Success|Failure)!/.test(l));
  const err = errorBlock(text, maxErrorLines).split('\n').filter((l) => l.trim() !== '' && !/^\s*[├│└]/.test(l));
  return short([...head, ...(text.includes('Error:') ? ['', ...err] : [])].join('\n'));
}

function stop(why) {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
}

async function main() {
  const i = await initPlain(work);
  facts.init_ok = i.code === 0;
  rec.step('terraform init', short(grep(i.out, /^- (Find|Install)|^Terraform has been|^Error/).join('\n')), 'init downloads the Docker provider. A mock replaces the provider at test time, but init still needs it for its schema.');
  if (i.code !== 0) return stop('terraform init failed.');

  facts.test_block_count = (readFileSync(join(work, 'tests', 'mock.tftest.hcl'), 'utf8').match(/^run "/gm) ?? []).length;

  // 1. the mocked tests, with no Docker socket
  const t = runPlain(['test'], work);
  writeFileSync(join(work, 'test-output.txt'), t.out);
  const s = summary(t.out);
  facts.test_passed_count = s.passed;
  facts.test_failed_count = s.failed;
  rec.step(
    'terraform test   (the toolkit mounts no Docker socket for this step)',
    testView(t.out),
    s.failed === 0 ? 'All runs pass with no Docker engine involved. Nothing was created, nothing needs cleaning up.' : 'A run fails. Read the error: a mock invents every value the provider would compute, and an invented empty list has no first element.',
  );
  if (s.failed > 0 || s.passed === 0) return stop('terraform test has failing runs. The mock needs a value the tests rely on. Fix the test file, then run this again.');

  // 2. a real apply cannot do that
  const p = runPlain(['apply', '-auto-approve'], work);
  facts.apply_without_docker_fails = p.code !== 0;
  rec.step('terraform apply -auto-approve   (still no Docker socket)', short(errorBlock(p.out, 8)), 'A real apply needs the provider to talk to Docker. The mocked test never did.');

  // 3. what the mock cannot know: the name is already taken
  const blocker = name(N, 'web');
  docker(['run', '-d', '--rm', ...label(N), '--name', blocker, '--memory', '16m', '--pids-limit', '20', 'alpine:3.23', 'sleep', '600']);
  const a = run(['apply', '-auto-approve'], work);
  facts.real_apply_conflict = a.code !== 0 && /already in use/.test(a.out);
  const conflict = firstMatch(a.out, /^Error: Unable to create container/).replace(/container "[0-9a-f]+"/, 'container "..."');
  rec.step(
    `docker run -d --name ${blocker} alpine:3.23 sleep 600, then terraform apply   (with Docker)`,
    short([...grep(a.out, /Creation complete/).map((l) => l.replace(/\[id=[^\]]*\]/, '[id=...]')), conflict].join('\n')),
    'The mocked tests said the container is fine. Docker says another container has that name. A mock knows the rules of your code, not the rules of the real system.',
  );
  docker(['rm', '-f', blocker]);

  // 4. and what a real value looks like
  run(['destroy', '-auto-approve'], work);
  const a2 = run(['apply', '-auto-approve'], work);
  facts.real_apply_after_removal_ok = a2.code === 0;
  const o = run(['output', '-raw', 'ip_address'], work);
  const realIp = o.stdout.trim();
  facts.real_ip_differs_from_mock = a2.code === 0 && realIp !== '' && realIp !== MOCK_IP;
  rec.step(
    `remove ${blocker}, terraform apply, terraform output -raw ip_address`,
    short([...grep(a2.out, /Apply complete|^Error/), `ip_address = ${realIp}`, `mock value  = ${MOCK_IP}`].join('\n')),
    'The address Docker chose is not the address the mock invented. Your assertions about computed values test your mock, not Docker.',
  );
  const d = run(['destroy', '-auto-approve'], work);
  const dm = /Destroy complete! Resources: (\d+) destroyed/.exec(d.out);
  facts.destroyed_count = dm ? Number(dm[1]) : 0;
  rec.step('terraform destroy -auto-approve', short(grep(d.out, /Destroy complete|^Error/).join('\n')), 'The real container, network and image resource are gone.');
}

try {
  cleanup(N);
  save();
  await main();
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  docker(['rm', '-f', name(N, 'web')]);
  if (existsSync(join(work, 'terraform.tfstate'))) run(['destroy', '-auto-approve'], work);
  cleanup(N);
  const left = leftovers(N);
  facts.leftover_count = left.containers + left.networks + left.volumes;
  save();
  rec.step(`node toolkit/cleanup.mjs ${N}`, `Still labelled tfc.challenge=${N}: ${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes.`, 'Everything this part made is gone. The alpine image stays.');
  if (recording() && useReference()) {
    rec.write(join(here, 'results.md'), `${process.platform}, runner ${mode()}, Terraform 1.17.1 in the pinned image, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c8.p2');
}
