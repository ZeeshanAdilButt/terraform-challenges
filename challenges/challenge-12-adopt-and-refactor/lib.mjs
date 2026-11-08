// Shared helpers for challenge 12. Plain Node, no npm packages.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { tf, planCounts } from '../../toolkit/tf.js';
import { run as rawRun, label, cleanup, leftovers } from '../../toolkit/docker.js';

export const N = 12;
export const NET = 'tfc-c12-net';
export const WEB = 'tfc-c12-web';
export const CACHE = 'tfc-c12-cache';

/** docker, tried again when the Docker CLI crashes now and then ("fatal error: unexpected signal") on a busy machine. */
export function run(args, opts) {
  let r;
  for (let i = 0; i < 4; i += 1) {
    r = rawRun(args, opts);
    if (r.code === 0 || !/fatal error|unexpected signal|EOF|timed out/.test(r.stderr)) return r;
    sleep(1500);
  }
  return r;
}

/** cleanup(N) until nothing labelled is left (at most 4 rounds). Returns what the last round removed and what is left. */
export function cleanAll() {
  let removed = { containers: [], networks: [], volumes: [] };
  let left = { containers: 1, networks: 1, volumes: 1 };
  for (let i = 0; i < 4; i += 1) {
    const r = cleanup(N);
    removed = { containers: [...removed.containers, ...r.containers], networks: [...removed.networks, ...r.networks], volumes: [...removed.volumes, ...r.volumes] };
    left = leftovers(N);
    if (left.containers + left.networks + left.volumes === 0) break;
    sleep(1500);
  }
  return { removed, left };
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Run Terraform in a folder (docker provider, so the Docker socket is mounted). When the shared plugin cache was
 * busy (several runs on one machine install the same provider at once) the run fails with a message about plugins;
 * then we run `init` again and repeat. Waiting and repeating is the fix.
 */
export function tfx(args, cwd, opts = {}) {
  const busy = /Failed to install provider|no version is selected|Inconsistent dependency lock file|Required plugins are not installed|text file busy/;
  let r;
  for (let i = 0; i < 4; i += 1) {
    r = tf(args, { cwd, docker: true, ...opts });
    if (r.code === 0 || !busy.test(r.out)) return r;
    sleep(3000);
    if (args[0] !== 'init') tf(['init'], { cwd, docker: true });
  }
  return r;
}

/** Keep the lines of a text that match a pattern, at most max of them. */
export function grep(text, re, max = 25) {
  return text.split('\n').filter((l) => re.test(l)).slice(0, max).join('\n');
}

/** The id of a container (full 64 characters), or '' when there is none. */
export function containerId(name) {
  return run(['inspect', '--format', '{{.Id}}', name]).stdout.trim();
}

/** When a container started, as Docker reports it. Same value before and after means it was never restarted. */
export function startedAt(name) {
  return run(['inspect', '--format', '{{.State.StartedAt}}', name]).stdout.trim();
}

export function isRunning(name) {
  return run(['inspect', '--format', '{{.State.Running}}', name]).stdout.trim() === 'true';
}

/** The labelled objects of this challenge, one line each, for the record. */
export function listObjects() {
  const f = `label=tfc.challenge=${N}`;
  const c = run(['ps', '-a', '--filter', f, '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}']).stdout.trim().split('\n').filter(Boolean).sort();
  const n = run(['network', 'ls', '--filter', f, '--format', '{{.Name}}\t{{.Driver}}']).stdout.trim().split('\n').filter(Boolean);
  return [...n.map((l) => `network   ${l.replace('\t', '  ')}`), ...c.map((l) => `container ${l.replace(/\t/g, '  ')}`)];
}

/** Build the stack by hand with the docker command, the way someone did before Terraform. Returns the ids. */
export function handBuild(attempt = 1) {
  const steps = [
    ['network', 'create', ...label(N), NET],
    ['run', '-d', '--name', WEB, ...label(N), '--network', NET, '--memory', '64m', '--memory-swap', '64m', 'nginx:1.27-alpine'],
    ['run', '-d', '--name', CACHE, ...label(N), '--network', NET, '--memory', '64m', '--memory-swap', '64m', 'alpine:3.23', 'sleep', '3600'],
  ];
  for (const a of steps) {
    const r = run(a);
    if (r.code !== 0) {
      // Docker Desktop now and then fails a call with a runtime error; clean up and try the whole build again.
      if (attempt < 3) {
        cleanup(N);
        sleep(2000);
        return handBuild(attempt + 1);
      }
      throw new Error(`docker ${a.join(' ')} failed: ${r.stderr}`);
    }
  }
  return { network: NET, web: containerId(WEB), cache: containerId(CACHE) };
}

/** Write the ids where the configuration can read them (variables web_id and cache_id). */
export function writeIds(work, ids) {
  writeFileSync(join(work, 'hand-built.auto.tfvars.json'), `${JSON.stringify({ web_id: ids.web, cache_id: ids.cache }, null, 2)}\n`);
}

/** Copy every .tf file (and the lock file) of one folder into another folder, creating it. */
export function copyTf(from, to, { skip = [] } = {}) {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    if ((f.endsWith('.tf') || f === '.terraform.lock.hcl' || f.endsWith('.tfvars.json')) && !skip.includes(f)) copyFileSync(join(from, f), join(to, f));
  }
}

export const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
export { planCounts };

/** Plan counts, also when the plan imports: "Plan: 3 to import, 0 to add, 2 to change, 0 to destroy." */
export function counts(text) {
  const m = /Plan: (?:(\d+) to import, )?(\d+) to add, (\d+) to change, (\d+) to destroy/.exec(text);
  return m ? { import: Number(m[1] || 0), add: +m[2], change: +m[3], destroy: +m[4] } : null;
}

/** Apply counts, also when the apply imports: "Apply complete! Resources: 3 imported, 0 added, 2 changed, 0 destroyed." */
export function applied(text) {
  const m = /Apply complete! Resources: (?:(\d+) imported, )?(\d+) added, (\d+) changed, (\d+) destroyed/.exec(text);
  return m ? { imported: Number(m[1] || 0), added: +m[2], changed: +m[3], destroyed: +m[4] } : null;
}

/**
 * Build the "before" stack with Terraform, the way the old code did: apply part-folder/before/main.tf in
 * work/legacy, then hand its state file and lock file to work/. Returns the apply result.
 */
export function applyLegacy(partPath, work) {
  const legacy = join(work, 'legacy');
  mkdirSync(legacy, { recursive: true });
  copyFileSync(join(partPath, 'before', 'main.tf'), join(legacy, 'main.tf'));
  const init = tfx(['init'], legacy);
  if (init.code !== 0) return init;
  const apply = tfx(['apply', '-auto-approve'], legacy);
  if (apply.code === 0) {
    copyFileSync(join(legacy, 'terraform.tfstate'), join(work, 'terraform.tfstate'));
    copyFileSync(join(legacy, '.terraform.lock.hcl'), join(work, '.terraform.lock.hcl'));
  }
  return apply;
}
