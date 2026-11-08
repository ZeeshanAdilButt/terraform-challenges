// Challenge 8, part 1: terraform test.
// Run: node challenges/challenge-8-tests-and-gate/part-1-terraform-test/run.mjs
// Add --record to also write results.md. Use --reference (or TFC_REFERENCE=1) to run the solution instead of your files.
//
// It copies your files to work/, runs init and `terraform test`, and (once all tests pass) breaks the config on purpose
// in a copy to show that the tests notice. No Docker objects are created: this part uses the local provider only.

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { mode } from '../../../toolkit/tf.js';
import { initPlain, runPlain, short, errorBlock , saveFacts } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 8, part 1: terraform test');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });

const facts = {
  init_ok: false,
  test_block_count: 0,
  test_passed_count: 0,
  test_failed_count: 0,
  mutant_caught: false,
  mutant_failed_count: 0,
  file_left_after_test: true,
};
const save = () => saveFacts("c8.p1", facts);

/** The test summary line "Success! 5 passed, 0 failed." or "Failure! 2 passed, 2 failed.", as numbers. */
function summary(text) {
  const m = /(?:Success|Failure)! (\d+) passed, (\d+) failed/.exec(text);
  return m ? { passed: +m[1], failed: +m[2] } : { passed: 0, failed: 0 };
}

/** The part of terraform test output a reader needs: the run lines, the summary, then the first error. */
function testView(text, maxErrorLines = 8) {
  const lines = text.split('\n');
  const head = lines.filter((l) => /^\S.*\.\.\. (in progress|tearing down|pass|fail)|^  run "|^(Success|Failure)!/.test(l));
  const err = errorBlock(text, maxErrorLines).split('\n').filter((l) => l.trim() !== '' && !/^\s*[├│└]/.test(l));
  return short([...head, ...(text.includes('Error:') ? ['', ...err] : [])].join('\n'));
}

async function main() {
  const i = await initPlain(work);
  facts.init_ok = i.code === 0;
  rec.step('terraform init', short(i.out.split('\n').filter((l) => /^- (Find|Install)|^Terraform has been|^Error/.test(l)).join('\n')), 'init downloads the local provider. terraform test needs it, like plan does.');
  if (i.code !== 0) return stop('terraform init failed.');

  facts.test_block_count = (readFileSync(join(work, 'tests', 'main.tftest.hcl'), 'utf8').match(/^run "/gm) ?? []).length;

  const t = runPlain(['test'], work);
  writeFileSync(join(work, 'test-output.txt'), t.out);
  const s = summary(t.out);
  facts.test_passed_count = s.passed;
  facts.test_failed_count = s.failed;
  facts.file_left_after_test = existsSync(join(work, 'out', 'shop.conf'));
  rec.step(
    'terraform test',
    testView(t.out),
    s.failed === 0
      ? `Every run block passed. The apply run created out/shop.conf and destroyed it again when the file ended (file left behind: ${facts.file_left_after_test}).`
      : 'Some runs failed. Each failure names the run block, the condition, and the message you wrote. Read it, then fix the code or the test.',
  );
  if (s.failed > 0 || s.passed === 0) return stop('terraform test has failing runs. Fix main.tf (the tests say what is wrong), then run this again.');

  // Break the config on purpose, in a copy, and run the same tests.
  const mutant = join(work, '..', 'work-mutant');
  rmSync(mutant, { recursive: true, force: true });
  cpSync(work, mutant, { recursive: true, filter: (p) => !/[\\/](\.terraform|out|test-output\.txt)$/.test(p) });
  const mf = join(mutant, 'main.tf');
  writeFileSync(mf, readFileSync(mf, 'utf8').replace('"  listen ${var.port};"', '"  listen 80;"'));
  await initPlain(mutant);
  const m = runPlain(['test'], mutant);
  const ms = summary(m.out);
  facts.mutant_failed_count = ms.failed;
  facts.mutant_caught = ms.failed > 0;
  rec.step(
    'change  "  listen ${var.port};"  to  "  listen 80;"  in a copy of main.tf, then terraform test',
    testView(m.out, 6),
    facts.mutant_caught ? 'The tests notice the change. A test that cannot fail on a broken config is worth nothing: this run is the proof that these can.' : 'The tests did not notice. They do not check the rendered port.',
  );
  rmSync(mutant, { recursive: true, force: true });
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
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c8.p1');
}
