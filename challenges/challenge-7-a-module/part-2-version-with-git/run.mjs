// Challenge 7, part 2: version a module with Git tags.
// Run: node challenges/challenge-7-a-module/part-2-version-with-git/run.mjs
// Add --record to also write results.md. Use --reference (or TFC_REFERENCE=1) to run the solution instead of your files.
//
// It builds a local Git repository of the module (work/modrepo) with three tags, then:
//   main flow:  init, plan, apply and destroy your main.tf, and reads what init wrote to .terraform/modules/modules.json
//   demo flow:  a scratch caller that goes from v1.0.0 to v1.1.0 (nothing changes), to v2.0.0 (the plan breaks),
//               tries a version constraint on a Git source, and moves a tag to show what a tag pin does not protect.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { cleanup, leftovers } from '../../../toolkit/docker.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { applyCounts, mode, planCounts } from '../../../toolkit/tf.js';
import { N, init, run, short, grep, firstMatch, errorBlock, parse , saveFacts } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 7, part 2: version a module with Git tags');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });
const repo = join(work, 'modrepo');
const demo = join(work, 'demo');
const demoRepo = join(demo, 'modrepo');
const VERSIONS = ['v1.0.0', 'v1.1.0', 'v2.0.0'];

const facts = {
  tags_count: 0,
  init_ok: false,
  plan_ok: false,
  apply_ok: false,
  pinned_to_tag: false,
  module_source_recorded: '',
  destroyed_count: 0,
  upgrade_minor_changes_count: -1,
  upgrade_major_plan_fails: false,
  upgrade_major_error: '',
  upgrade_major_fixed_changes_count: -1,
  version_on_git_source_error: '',
  stale_plan_error: '',
  moved_tag_plain_init_changes_count: -1,
  moved_tag_upgrade_plan_fails: false,
  commit_pin_changes_count: -1,
  leftover_count: -1,
};
const save = () => saveFacts("c7.p2", facts);
const stopHere = (why) => {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
};

const ok = (r) => r.code === 0;
const keep = (text, re, max = 25) => short(grep(text, re).join('\n'), max);
const noId = (l) => l.replace(/\[id=[0-9a-f]{12}[0-9a-f]*\]/, '[id=...]');

// ---- the Git repository ------------------------------------------------------------------------------------------

function git(args, cwd = repo) {
  const r = spawnSync('git', ['-c', 'user.name=Module Author', '-c', 'user.email=author@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', windowsHide: true });
  if (r.error) throw new Error(`git is not available: ${r.error.message}. Install Git, then run this again.`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** Build work/modrepo: one commit and one tag per version. main ends at v2.0.0, like a repository you do not control. */
function buildRepo(repo) {
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(repo, { recursive: true });
  git(['init', '-q', '-b', 'main'], repo);
  for (const v of VERSIONS) {
    for (const f of readdirSync(repo)) if (f !== '.git') rmSync(join(repo, f), { recursive: true, force: true });
    cpSync(join(work, 'versions', v), repo, { recursive: true });
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', `Release ${v.slice(1)}`], repo);
    git(['tag', v], repo);
  }
}

/** The address of the repository as Terraform sees it: inside the container the work folder is /work. */
function repoUrl(folder) {
  if (mode() === 'docker') return 'file:///work/modrepo';
  const p = join(folder, 'modrepo').replace(/\\/g, '/');
  return `file://${p.startsWith('/') ? '' : '/'}${p}`;
}

const source = (folder, ref) => `git::${repoUrl(folder)}?ref=${ref}`;

// ---- main flow ---------------------------------------------------------------------------------------------------

async function main() {
  buildRepo(repo);
  facts.tags_count = git(['tag'], repo).split('\n').filter(Boolean).length;
  rec.step('git log --oneline --decorate  (in work/modrepo)', git(['log', '--oneline', '--decorate']).replace(/\b[0-9a-f]{7}\b/g, (h) => h), 'A repository with three releases. The default branch, main, ends at the newest one: 2.0.0.');

  const mainTf = join(work, 'main.tf');
  writeFileSync(mainTf, readFileSync(mainTf, 'utf8').replaceAll('REPO_URL', repoUrl(work)));
  const shown = grep(readFileSync(mainTf, 'utf8'), /source\s+= "git::/).join('\n').trim();
  const ref = /\?ref=([^"]+)"/.exec(shown)?.[1] ?? '';
  facts.pinned_to_tag = VERSIONS.includes(ref);

  const i = await init(work);
  rec.step('terraform init', ok(i) ? keep(i.out, /^Initializing modules|^Downloading|^- app|^- Install|^Terraform has been/) : errorBlock(i.out), ok(i) ? `init fetched the module from the repository at the ref you chose (${ref}). ${shown}` : 'init failed: it reads the module and checks the arguments the caller passes.');
  facts.init_ok = ok(i);
  if (!ok(i)) return stopHere(`terraform init failed. The ref in main.tf is "${ref}". If the error is about an argument the module does not expect, that ref points at a release with a different interface than the one the caller was written for. Which tag still matches? Or what must the caller change?`);

  const p = run(['plan', '-out=tfplan'], work);
  const pc = planCounts(p.out);
  facts.plan_ok = ok(p) && !!pc;
  rec.step('terraform plan -out=tfplan', ok(p) ? keep(p.out, /^Plan:/) : errorBlock(p.out, 12), ok(p) ? 'The module at this ref accepts what the caller passes.' : 'The caller and the module no longer agree. Nothing in the caller changed: the module did.');
  if (!ok(p) || !pc) return stopHere(`terraform plan failed. The ref in main.tf is "${ref}". Which tag still matches the arguments the caller passes? Or which arguments does that tag want?`);

  const a = run(['apply', '-auto-approve', 'tfplan'], work);
  const ac = applyCounts(a.out);
  facts.apply_ok = ok(a) && !!ac;
  rec.step('terraform apply tfplan', short(grep(a.out, /Apply complete|^Error/).map(noId).join('\n')), facts.apply_ok ? 'Two containers, built from the pinned module.' : 'apply failed.');
  if (!facts.apply_ok) return stopHere('terraform apply failed.');

  const manifest = JSON.parse(readFileSync(join(work, '.terraform', 'modules', 'modules.json'), 'utf8'));
  const entry = manifest.Modules.find((m) => m.Key.startsWith('app')) ?? {};
  facts.module_source_recorded = entry.Source ?? '';
  rec.step(
    'cat .terraform/modules/modules.json   (the Key, Source and Dir of the module)',
    JSON.stringify({ Key: entry.Key, Source: entry.Source, Dir: entry.Dir }, null, 2),
    'This is what init pins: the source string, including the ref. It stores no commit hash and no checksum. The .terraform folder is not committed; the ref in main.tf is the only pin there is.',
  );

  const d = run(['destroy', '-auto-approve'], work);
  const dm = /Destroy complete! Resources: (\d+) destroyed/.exec(d.out);
  facts.destroyed_count = dm ? Number(dm[1]) : 0;
  rec.step('terraform destroy -auto-approve', keep(d.out, /Destroy complete|^Error/), 'The module version is not part of what destroy removes: only the containers and networks.');

  if (!facts.pinned_to_tag) console.log(`\nNote: main.tf points at "${ref}", which is not a release tag. The test wants a tag.`);
  // The plugin cache is shared with other challenges, and a parallel install can break one step of the demo.
  // Run the demo again (up to three times) when the facts it should produce are missing.
  const stepsBefore = rec.steps.length;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    rec.steps.length = stepsBefore;
    await demoFlow();
    const good = facts.upgrade_minor_changes_count === 0 && facts.upgrade_major_error !== '' && facts.upgrade_major_fixed_changes_count === 0 && facts.commit_pin_changes_count === 0;
    if (good) break;
    for (const dir of [demo]) if (existsSync(join(dir, 'terraform.tfstate'))) run(['destroy', '-auto-approve'], dir);
  }
}

// ---- demo flow: what happens when the ref changes -----------------------------------------------------------------

function writeCaller(dir, ref, memoryArg = 'memory_mb', extra = '') {
  const tmpl = readFileSync(join(work, 'versions', 'caller.tf.tmpl'), 'utf8');
  const text = tmpl.replace('__SOURCE__', source(dir, ref)).replace('__MEMORY_ARG__', memoryArg.padEnd(12)).replace('  source   =', `${extra}  source   =`);
  writeFileSync(join(dir, 'main.tf'), text);
}

const changes = (text) => (/No changes/.test(text) ? 0 : (() => { const c = planCounts(text); return c ? c.add + c.change + c.destroy : -1; })());

async function demoFlow() {
  rmSync(demo, { recursive: true, force: true });
  mkdirSync(demo, { recursive: true });
  buildRepo(demoRepo);

  // 1. v1.0.0
  writeCaller(demo, 'v1.0.0');
  const i1 = await init(demo);
  const a1 = run(['apply', '-auto-approve'], demo);
  rec.step('ref=v1.0.0: terraform init, terraform apply -auto-approve', short([...grep(i1.out, /^Downloading|^Error/), ...grep(a1.out, /Apply complete|^Error/)].join('\n')), 'The starting point: version 1.0.0 is installed and applied.');
  if (!ok(i1) || !ok(a1)) throw new Error(`the demo caller at v1.0.0 failed:\n${errorBlock(i1.out + a1.out)}`);

  // 2. change the ref to v1.1.0 without init
  writeCaller(demo, 'v1.1.0');
  const stale = run(['plan'], demo);
  facts.stale_plan_error = firstMatch(stale.out, /^Error/).replace(/^Error: /, '');
  rec.step('change ?ref=v1.0.0 to ?ref=v1.1.0, then terraform plan (no init)', errorBlock(stale.out, 10), 'A changed source is not picked up on its own. Terraform asks for init.');

  // 3. init and plan at v1.1.0
  const i2 = await init(demo);
  const p2 = run(['plan', '-detailed-exitcode'], demo);
  facts.upgrade_minor_changes_count = changes(p2.out);
  rec.step('terraform init, then terraform plan -detailed-exitcode', short([...grep(i2.out, /^Downloading|^Error/), ...grep(p2.out, /^No changes|^Plan:|^Error/)].join('\n')), `A backwards compatible release: new optional input, new output. Plan exit code ${p2.code} (0 = nothing to do).`);

  // 4. v2.0.0 with the old argument: init already refuses
  writeCaller(demo, 'v2.0.0');
  const i3 = await init(demo);
  facts.upgrade_major_plan_fails = !ok(i3);
  facts.upgrade_major_error = firstMatch(i3.out, /An argument named/).replace(/^.*An argument named/, 'An argument named');
  rec.step('?ref=v2.0.0 and the old argument memory_mb: terraform init', errorBlock(i3.out, 10), 'A breaking release: memory_mb was renamed memory_limit_mb. Terraform reads the module at init and refuses the old argument. The caller must change before it can use 2.0.0.');

  // 5. v2.0.0 with the renamed argument
  writeCaller(demo, 'v2.0.0', 'memory_limit_mb');
  await init(demo);
  const p4 = run(['plan', '-detailed-exitcode'], demo);
  facts.upgrade_major_fixed_changes_count = changes(p4.out);
  rec.step('rename the argument to memory_limit_mb, then terraform init and terraform plan -detailed-exitcode', keep(p4.out, /^No changes|^Plan:|^Error/), `The resources are the same, so the upgrade changes nothing. Exit code ${p4.code}.`);

  // 6. a version constraint on a Git source
  const vdir = join(work, 'demo-version');
  rmSync(vdir, { recursive: true, force: true });
  mkdirSync(vdir, { recursive: true });
  cpSync(demoRepo, join(vdir, 'modrepo'), { recursive: true });
  writeCaller(vdir, 'v1.1.0', 'memory_mb', '  version  = "~> 1.0"\n');
  const iv = await init(vdir);
  facts.version_on_git_source_error = firstMatch(iv.out, /^Error/).replace(/^Error: /, '');
  rec.step('add  version = "~> 1.0"  to the module block with the git:: source, then terraform init', errorBlock(iv.out, 10), 'A version constraint works only for registry modules. A Git source has refs, not versions: the tag is the pin.');
  rmSync(vdir, { recursive: true, force: true });

  // 7. a tag that moves
  writeCaller(demo, 'v1.1.0');
  await init(demo);
  const base = run(['plan', '-detailed-exitcode'], demo);
  const v2commit = git(['rev-parse', 'v2.0.0'], demoRepo);
  const v110commit = git(['rev-parse', 'v1.1.0'], demoRepo);
  git(['tag', '-f', 'v1.1.0', v2commit], demoRepo);
  const plain = await init(demo);
  const pPlain = run(['plan', '-detailed-exitcode'], demo);
  facts.moved_tag_plain_init_changes_count = changes(pPlain.out);
  rec.step(
    'git tag -f v1.1.0 <the commit of v2.0.0>, then terraform init, then terraform plan',
    short([`plan before the tag moved: exit code ${base.code}`, ...grep(plain.out, /^Initializing modules|^Downloading|^Terraform has been|^Error/), ...grep(pPlain.out, /^No changes|^Plan:|^Error/)].join('\n')),
    'Someone moved the tag. A plain init sees the same source string, keeps the copy it already has, and the plan still passes. Nothing warns you.',
  );
  const up = await init(demo, ['-upgrade']);
  facts.moved_tag_upgrade_plan_fails = !ok(up);
  rec.step('terraform init -upgrade', errorBlock(up.out, 8), 'init -upgrade fetches the module again, and now v1.1.0 is the breaking code. The next engineer, or a CI runner with a fresh checkout, gets this.');

  // 8. pin to the commit
  writeFileSync(join(demo, 'main.tf'), readFileSync(join(demo, 'main.tf'), 'utf8').replace('?ref=v1.1.0', `?ref=${v110commit}`));
  await init(demo, ['-upgrade']);
  const pc = run(['plan', '-detailed-exitcode'], demo);
  facts.commit_pin_changes_count = changes(pc.out);
  rec.step(`?ref=<the commit id of the first v1.1.0>, then terraform init -upgrade and terraform plan`, short([`ref = ${v110commit.slice(0, 12)}...`, ...grep(pc.out, /^No changes|^Plan:|^Error/)].join('\n')), 'A commit id cannot be moved. It is the strictest pin a Git source offers.');

  const d = run(['destroy', '-auto-approve'], demo);
  rec.step('terraform destroy -auto-approve  (the demo caller)', keep(d.out, /Destroy complete|^Error/), 'Everything the demo made is gone.');
}

try {
  cleanup(N);
  save();
  await main();
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  for (const dir of [work, demo]) if (existsSync(join(dir, 'terraform.tfstate'))) run(['destroy', '-auto-approve'], dir);
  cleanup(N);
  const left = leftovers(N);
  facts.leftover_count = left.containers + left.networks + left.volumes;
  save();
  rec.step(`node toolkit/cleanup.mjs ${N}`, `Still labelled tfc.challenge=${N}: ${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes.`, 'Everything this part made is gone.');
  if (recording() && useReference()) {
    rec.write(join(here, 'results.md'), `${process.platform}, runner ${mode()}, Terraform 1.17.1 in the pinned image, Git ${spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout.trim().replace('git version ', '')}, Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c7.p2');
}
