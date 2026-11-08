// Challenge 4, part 1: the lock file.
// Run: node challenges/challenge-4-lock-file-and-graph/part-1-the-lock-file/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the reference solution instead of your files.
//
// It runs Terraform in work/, a copy of your files. Steps: init and read the lock file, a lock that holds an
// older version while your constraint wants a newer one (init refuses; init -upgrade moves), and
// `providers lock` for the platforms in platforms.txt.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tf } from '../../../toolkit/tf.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { cleanup } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, clean, initRetry, lockInfo } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 4, part 1: the lock file');
const work = prepareWork(import.meta.url);
const OLD = '2.8.0';

/** The output without blank lines. */
const compact = (out) => clean(out).split('\n').map((l) => l.trimEnd()).filter(Boolean).join('\n');

/** Keep the lines that match. */
const pick = (out, re) => clean(out).split('\n').map((l) => l.trimEnd()).filter((l) => re.test(l)).join('\n');

/** The lock file as written, with long hash lists folded so a step stays short. */
function showLock(text) {
  const all = text.trimEnd().split('\n');
  const isHash = (x) => /^\s+"(h1|zh):/.test(x);
  const total = all.filter(isHash).length;
  if (total <= 4) return text.trimEnd();
  const out = [];
  let seen = 0;
  for (const x of all) {
    if (isHash(x)) {
      seen += 1;
      if (seen > 2) continue;
    }
    out.push(x);
    if (seen === 2 && isHash(x)) out.push(`    ... ${total - 2} more hash lines, folded here`);
  }
  return out.join('\n');
}

try {
  cleanup(N);

  // Step 1: the .gitignore.
  const gi = readFileSync(join(work, 'team.gitignore'), 'utf8');
  const ignoresLock = gi.split('\n').some((l) => l.trim() === '.terraform.lock.hcl');
  setFact('c4.p1.gitignore_ignores_lock', ignoresLock);
  rec.step(
    'grep -n "lock" team.gitignore',
    gi.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /lock/.test(l) && !l.startsWith('#')).map(([i, l]) => `${i}:${l}`).join('\n') || '(no line mentions the lock file)',
    ignoresLock
      ? 'Git would never see the lock file, so it could never be committed. That is the second fix.'
      : 'Nothing keeps the lock file out of Git. Good: it is meant to be committed.',
  );

  // Step 2: init without a lock file, then read the lock file.
  const i1 = initRetry(work);
  const lockText = readFileSync(join(work, '.terraform.lock.hcl'), 'utf8');
  const l1 = lockInfo(lockText);
  rec.step('terraform init', compact(i1.out), 'No lock file yet, so init picks the newest version that matches the constraint and writes the lock file.');
  rec.step('cat .terraform.lock.hcl', showLock(lockText), 'Read three things: the exact version, the constraints line (the rule it was chosen under; missing when the configuration set none) and the checksums.');
  setFact('c4.p1.locked_version', l1.version);
  setFact('c4.p1.lock_constraint', l1.constraints ?? 'none');
  setFact('c4.p1.lock_h1_hash_count', l1.h1);
  setFact('c4.p1.lock_zh_hash_count', l1.zh);

  // Step 3: a lock that holds an older version.
  const old = join(work, 'old');
  mkdirSync(old, { recursive: true });
  const mainTf = readFileSync(join(work, 'main.tf'), 'utf8')
    .replace(/\n\s*version\s*=\s*"[^"]*"/, '')
    .replace(/(source\s*=\s*"hashicorp\/local")/, `$1\n      version = "= ${OLD}"`);
  writeFileSync(join(old, 'main.tf'), mainTf);
  const i2 = initRetry(old);
  const oldLock = lockInfo(readFileSync(join(old, '.terraform.lock.hcl'), 'utf8'));
  rec.step(
    `(a copy of the folder with the constraint "= ${OLD}")  terraform init`,
    `${pick(i2.out, /^- /)}\nlock file now says: version ${oldLock.version}, constraints "${oldLock.constraints}"`,
    'This stands in for a lock file somebody committed a while ago. Its version is older than the newest one.',
  );
  setFact('c4.p1.old_lock_version', oldLock.version);

  copyFileSync(join(work, 'main.tf'), join(old, 'main.tf'));
  const i3 = initRetry(old);
  const refused = i3.code !== 0;
  const flat = clean(i3.out).replace(/\s+/g, ' ');
  const refusalLine = refused ? (flat.match(/locked provider .*? allow selection of new versions/)?.[0] ?? '') : '';
  rec.step(
    'cp main.tf old/main.tf   (your constraint; the old lock file stays)   then: terraform init',
    `${clean(i3.out).split('\n').filter((l) => l.trim() && !/^(To see which|versions are specified|    terraform providers)/.test(l)).slice(0, 14).join('\n')}\n[exit code ${i3.code}]`,
    refused
      ? 'The lock file wins over the new constraint. init stops and names the way out: -upgrade.'
      : 'Your configuration set no constraint, so the locked version is still allowed and init just reuses it. The lock decided, not you.',
  );
  setFact('c4.p1.init_refused_old_lock', refused);
  setFact('c4.p1.init_old_lock_exit_code', i3.code);
  setFact('c4.p1.refusal_line', refusalLine || 'none');

  const i4 = initRetry(old, ['init', '-upgrade']);
  const upg = lockInfo(readFileSync(join(old, '.terraform.lock.hcl'), 'utf8'));
  rec.step(
    'terraform init -upgrade',
    `${compact(i4.out)}\nlock file now says: version ${upg.version}, constraints ${upg.constraints ? `"${upg.constraints}"` : 'none'}`,
    '-upgrade is the one command that moves a locked version. Read the new lock file and commit it on purpose, in its own change.',
  );
  setFact('c4.p1.upgrade_version', upg.version);
  setFact('c4.p1.upgrade_moved_version', upg.version !== oldLock.version);

  // Step 4: checksums for the platforms of the team.
  const platforms = readFileSync(join(work, 'platforms.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const pl = tf(['providers', 'lock', ...platforms.map((p) => `-platform=${p}`)], { cwd: work });
  const lockAfter = lockInfo(readFileSync(join(work, '.terraform.lock.hcl'), 'utf8'));
  rec.step(
    `terraform providers lock ${platforms.map((p) => `-platform=${p}`).join(' ')}`,
    `${pick(pl.out, /^- |Success/)}\nlock file now holds ${lockAfter.h1} h1 checksum(s) and ${lockAfter.zh} zh checksum(s)`,
    'init only records the checksum for the platform it ran on. providers lock fetches the others, so a Mac, a Windows laptop and a Linux CI runner all accept the same committed lock file.',
  );
  setFact('c4.p1.platforms_count', platforms.length);
  setFact('c4.p1.lock_h1_hash_after_providers_lock_count', lockAfter.h1);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, ${useReference() ? 'reference solution' : 'starter files'}, Node ${process.versions.node}, TFC_MODE=${process.env.TFC_MODE ?? 'default'}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Checksums (h1) in the lock file, by step',
        unit: 'h1 hashes',
        bars: [
          { label: 'after terraform init', value: l1.h1 },
          { label: 'after providers lock', value: lockAfter.h1 },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c4.p1');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  cleanup(N);
}
