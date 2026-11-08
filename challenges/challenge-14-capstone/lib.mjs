// Helpers shared by the four parts of challenge 14 (the capstone). Plain Node, no npm packages.
//
// The capstone is different from the other challenges: your files do not live in the part folders. They live in
// capstone/ at the top of this repository, because that is where the checker looks. Each part's run.mjs copies
// capstone/ (and .github/) to its own work/ folder and runs Terraform there. With --reference it lays the solution of
// parts 1 to N over your files instead.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tfAsync, hostName } from '../../toolkit/tf.js';
import { run as docker } from '../../toolkit/docker.js';
import { getFact, setFact } from '../../toolkit/facts.js';
import { useReference } from '../../toolkit/part.js';

export const N = 14;
export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..');

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
export const clean = (s) => String(s).replace(ANSI, '').replace(/\r\n/g, '\n');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const PARTS = ['part-1-define-the-platform', 'part-2-ship-it-through-a-pipeline', 'part-3-break-it-and-recover-it', 'part-4-the-defence'];

/**
 * Make a fresh work folder for part number `part` (1 to 4) and return its path.
 * It holds a copy of your capstone/ and .github/workflows/terraform.yml. With --reference (or TFC_REFERENCE=1) the
 * reference files of parts 1 to `part` are laid over them, so every part starts from a platform that works.
 * A work folder lives next to run.mjs and is ignored by Git.
 */
export function prepareCapstone(metaUrl, part) {
  const dir = dirname(fileURLToPath(metaUrl));
  const work = join(dir, 'work');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const skip = (src) => !/[\\/](\.terraform|\.state|work|backups)([\\/]|$)/.test(src) && !/\.(tfplan|plan\.json)$/.test(src) && !/terraform\.tfstate/.test(src);
  cpSync(join(REPO, 'capstone'), join(work, 'capstone'), { recursive: true, filter: skip });
  if (existsSync(join(REPO, '.github', 'workflows', 'terraform.yml'))) {
    mkdirSync(join(work, '.github', 'workflows'), { recursive: true });
    cpSync(join(REPO, '.github', 'workflows', 'terraform.yml'), join(work, '.github', 'workflows', 'terraform.yml'));
  }
  if (useReference()) {
    for (const p of PARTS.slice(0, part)) {
      const ref = join(HERE, p, 'reference');
      if (existsSync(ref)) cpSync(ref, work, { recursive: true });
    }
  }
  return work;
}

/** The work folder of a part, for tests (call run.mjs first). null when there is none. */
export function workOf(metaUrl) {
  const w = join(dirname(fileURLToPath(metaUrl)), 'work');
  return existsSync(w) && statSync(w).isDirectory() ? w : null;
}

export const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/** Keep at most max lines. Blank runs are dropped. A line "..." marks what was left out. */
export function short(text, max = 25) {
  const lines = clean(text).split('\n').filter((l, i, a) => !(l.trim() === '' && (i === 0 || a[i - 1].trim() === '')));
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return (lines.length <= max ? lines : [...lines.slice(0, max - 1), '...']).join('\n');
}

/** The lines of a text that match, joined. */
export const grep = (text, re) => clean(text).split('\n').filter((l) => re.test(l)).join('\n');

/** The first line that matches, trimmed, or ''. */
export const first = (text, re) => (clean(text).split('\n').find((l) => re.test(l)) || '').trim();

/** The Terraform error block: from the first "Error" line, without box characters or blank lines. */
export function errorBlock(text, max = 14) {
  const lines = clean(text).split('\n').map((l) => l.replace(/^[│╷╵]\s?/, '').trimEnd());
  const i = lines.findIndex((l) => /^Error/.test(l));
  if (i < 0) return '';
  return lines.slice(i).filter((l) => l.trim() !== '').slice(0, max).join('\n');
}

/** The last n non-empty lines. */
export const tail = (text, n = 3) => clean(text).split('\n').filter((l) => l.trim()).slice(-n).join('\n');

/** Replace container ids and timings that change on every run. */
export const stable = (t) => clean(t).replace(/\[id=sha256:[^\]]*\]/g, '[id=sha256:...]').replace(/\[id=[0-9a-f]{12,}\]/g, '[id=...]').replace(/after \d+s/g, 'after Ns').replace(/\(\d+(\.\d+)?s\)/g, '(Ns)');

export const planCountsOf = (text) => {
  const m = /Plan: (\d+) to add, (\d+) to change, (\d+) to destroy/.exec(text);
  return m ? { add: +m[1], change: +m[2], destroy: +m[3] } : /No changes/.test(text) ? { add: 0, change: 0, destroy: 0, none: true } : null;
};
export const applyCountsOf = (text) => {
  const m = /Apply complete! Resources: (\d+) added, (\d+) changed, (\d+) destroyed/.exec(text);
  return m ? { added: +m[1], changed: +m[2], destroyed: +m[3] } : null;
};

const CACHE_RACE = /text file busy|does not match any of the checksums|installed provider plugins are not consistent|Required plugins are not installed|Failed to install provider|Inconsistent dependency lock file/;

/**
 * Run Terraform in a folder (the Docker socket is mounted: the platform uses the Docker provider) without blocking the
 * event loop, because a state server lives in this process. Colour codes are removed. Returns { code, out }.
 * Several challenges share one provider cache. When another run is writing it, Terraform says the plugins do not
 * match or that a file is busy. That is not your fault: wait, run init again, and repeat the command.
 */
export async function terra(cwd, args, { env, initArgs, docker: useDocker = true, timeoutMs } = {}) {
  const go = async () => {
    const r = await tfAsync(args, { cwd, docker: useDocker, env, timeoutMs });
    return { code: r.code, out: clean(r.out) };
  };
  let r = await go();
  for (let i = 0; i < 6 && CACHE_RACE.test(r.out) && args.find((a) => !a.startsWith('-')) !== 'init'; i++) {
    await sleep(4000 * (i + 1));
    const chdir = args.find((a) => a.startsWith('-chdir='));
    await tfAsync(initArgs ?? [...(chdir ? [chdir] : []), 'init', '-input=false'], { cwd, docker: useDocker, env });
    r = await go();
  }
  return r;
}

/** `terraform init` with retries for the shared provider cache. */
export async function initTf(cwd, args = ['init', '-input=false'], opts = {}) {
  let r;
  for (let i = 0; i < 8; i++) {
    const x = await tfAsync(args, { cwd, docker: opts.docker ?? true, env: opts.env });
    r = { code: x.code, out: clean(x.out) };
    if (r.code === 0 || !CACHE_RACE.test(r.out)) break;
    await sleep(4000 * (i + 1));
  }
  return r;
}

/**
 * The -backend-config arguments for one environment: the settings in capstone/envs/<env>/backend.hcl, with the host and
 * port of the state server replaced by `base` (for example http://127.0.0.1:8850). Terraform in the container reaches
 * the server through host.docker.internal, so in docker mode the host is replaced as well.
 */
export function backendArgs(backendHcl, base) {
  const u = new URL(base);
  const host = ['127.0.0.1', 'localhost'].includes(u.hostname) ? hostName() : u.hostname;
  const origin = `http://${host}:${u.port}`;
  const args = [];
  for (const line of read(backendHcl).split('\n')) {
    const m = /^\s*(\w+)\s*=\s*"([^"]*)"/.exec(line);
    if (!m) continue;
    const [, k, v] = m;
    args.push(`-backend-config=${k}=${/^https?:\/\//.test(v) ? v.replace(/^https?:\/\/[^/]+/, origin) : v}`);
  }
  return args;
}

/**
 * A runner for one environment folder of the capstone. Terraform runs in capstone/ with -chdir=envs/<env>, because
 * the environment calls the module at ../../modules/service and the container only sees the folder it is given.
 */
export function envRunner({ work, env, base, token }) {
  const capstone = join(work, 'capstone');
  const chdir = `-chdir=envs/${env}`;
  const backend = backendArgs(join(capstone, 'envs', env, 'backend.hcl'), base);
  const tokenEnv = token ? { TF_HTTP_USERNAME: 'tf', TF_HTTP_PASSWORD: token } : {};
  const initArgs = [chdir, 'init', '-input=false', '-reconfigure', ...backend];
  const o = (extra = {}) => ({ ...extra, env: { ...tokenEnv, ...extra.env }, initArgs });
  return {
    env,
    dir: join(capstone, 'envs', env),
    capstone,
    init: (extra = {}) => initTf(capstone, initArgs, o(extra)),
    run: (args, extra = {}) => terra(capstone, [chdir, ...args], o(extra)),
    withToken: (t) => envRunner({ work, env, base, token: t }),
  };
}

/** HTTP status of a URL, or 0 when nothing answers. Also returns the first bytes of the body. */
export async function httpGet(url, timeoutMs = 5000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { status: res.status, body: (await res.text()).slice(0, 4000) };
  } catch {
    return { status: 0, body: '' };
  }
}

/** Ask a valkey container a question from inside the web container, over the platform network. */
export function askCacheFromWeb(web, cache, command) {
  const r = docker(['exec', web, 'sh', '-c', `printf '${command}\\r\\n' | nc -w 2 ${cache} 6379`]);
  return clean(`${r.stdout}${r.stderr}`).trim();
}

export const containerState = (name) => docker(['inspect', '--format', '{{.State.Status}}', name]).stdout.trim() || 'missing';
export const containerId = (name) => docker(['inspect', '--format', '{{.Id}}', name]).stdout.trim();

/** Names of the containers of this challenge (running or not), sorted. */
export function containers() {
  return docker(['ps', '-a', '--filter', `label=tfc.challenge=${N}`, '--format', '{{.Names}}']).stdout.split('\n').map((s) => s.trim()).filter(Boolean).sort();
}

/** The version, size in serial and resource count of a state file the state server holds. */
export function serverState(server, name) {
  const p = join(server.dir, `${name}.json`);
  if (!existsSync(p)) return null;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { serial: j.serial, lineage: j.lineage, resources: (j.resources || []).length };
}

/** Every file under a folder (relative, sorted), skipping .terraform. */
export function listFiles(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === '.terraform') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(relative(base, p).replaceAll('\\', '/'));
  }
  return out.sort();
}

/**
 * Save facts. Other challenges write facts.json at the same time and a write can be lost, so read the values back and
 * write again until all are there.
 */
export function saveFacts(prefix, facts) {
  const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      for (const [k, v] of Object.entries(facts)) setFact(`${prefix}.${k}`, v);
      if (Object.entries(facts).every(([k, v]) => getFact(`${prefix}.${k}`) === v)) return;
    } catch (e) {
      // Windows refuses the rename while another run holds facts.json open (EPERM, EBUSY). Wait and write again.
      if (!/EPERM|EBUSY|EACCES/.test(String(e.code))) throw e;
      wait(250);
    }
  }
  throw new Error(`Could not save the facts ${prefix}.*`);
}

export function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/**
 * Run a Node script as its own process, the way a pipeline runs a step. Does not block this process (a state server may
 * live here). Returns { code, out }. The shared provider cache can make a Terraform step fail once; that is retried.
 */
export async function runNode(args, { cwd, env = {} } = {}) {
  const once = () => new Promise((done) => {
    let out = '';
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8').on('data', (d) => { out += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { out += d; });
    child.on('error', (e) => done({ code: 127, out: `${out}${e.message}` }));
    child.on('close', (code) => done({ code: code ?? 1, out: clean(out) }));
  });
  let r;
  for (let i = 0; i < 4; i++) {
    r = await once();
    if (r.code === 0 || !CACHE_RACE.test(r.out)) break;
    await sleep(4000 * (i + 1));
  }
  return r;
}
