// Helpers shared by the three parts of challenge 11. Plain Node, no npm packages.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { tfAsync } from '../../../toolkit/tf.js';
import { run } from '../../../toolkit/docker.js';

export const N = 11;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
export const clean = (s) => String(s).replace(ANSI, '').replace(/\r\n/g, '\n');

/**
 * Run Terraform in a folder without blocking the event loop (a state server may live in this process).
 * Returns { code, out } with colour codes removed (the workspace commands ignore -no-color).
 * If another challenge is installing the same provider into the shared plugin cache at that moment,
 * Terraform can say the installed plugins do not match the lock file; one init and one retry fixes it.
 */
export async function terra(cwd, args, opts = {}) {
  const go = async () => {
    const r = await tfAsync(args, { cwd, docker: true, ...opts });
    return { code: r.code, out: clean(r.out) };
  };
  let r = await go();
  for (let i = 0; i < 4 && args[0] !== 'init' && /installed provider plugins are not consistent|Required plugins are not installed|doesn.?t match any of the checksums|Failed to install provider from shared cache|does not match any of the checksums|text file busy/.test(r.out); i++) {
    await new Promise((ok) => setTimeout(ok, 5000 * (i + 1)));
    const init = await tfAsync(['init', '-input=false', ...(opts.initArgs || [])], { cwd, docker: true, ...opts });
    if (init.code === 0) r = await go();
  }
  return r;
}

/**
 * terraform init with retries. Several challenges share one plugin cache folder, and a provider that another
 * run is installing at that moment can make init fail once (for example "text file busy"). Try again.
 */
export async function initWork(cwd, extra = [], opts = {}) {
  let r;
  for (let i = 0; i < 6; i++) {
    r = await tfAsync(['init', '-input=false', ...extra], { cwd, docker: true, ...opts });
    if (r.code === 0) break;
    await new Promise((ok) => setTimeout(ok, 4000 * (i + 1)));
  }
  return { code: r.code, out: clean(r.out) };
}

/** The last n non-empty lines of a text. */
export const tail = (text, n = 8) => clean(text).split('\n').filter((l) => l.trim()).slice(-n).join('\n');

/** The first n non-empty lines. */
export const head = (text, n = 12) => clean(text).split('\n').filter((l) => l.trim()).slice(0, n).join('\n');

/** The lines of a text that match a pattern. */
export const grep = (text, re) => clean(text).split('\n').filter((l) => re.test(l)).join('\n');

/** The "Error: ..." block of a Terraform output: from the first Error line to the end, without box characters. */
export function errorBlock(text, maxLines = 14) {
  const lines = clean(text).split('\n').map((l) => l.replace(/^[│╷╵]\s?/, '').trimEnd());
  const i = lines.findIndex((l) => l.startsWith('Error:'));
  if (i < 0) return '';
  return lines.slice(i).filter((l) => l.trim() !== '').slice(0, maxLines).join('\n');
}

/** Names of the containers labelled with this challenge (all of them, running or not), sorted. */
export function containers() {
  const r = run(['ps', '-a', '--filter', `label=tfc.challenge=${N}`, '--format', '{{.Names}}']);
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean).sort();
}

/** The environment variables of one container that start with a prefix, for example ["DB_MODE=standard"]. null if it does not exist. */
export function containerEnv(name, prefix) {
  const r = run(['inspect', '--format', '{{json .Config.Env}}', name]);
  if (r.code !== 0) return null;
  return JSON.parse(r.stdout).filter((e) => e.startsWith(prefix));
}

/** The id of a container, or null if it does not exist. */
export function containerId(name) {
  const r = run(['inspect', '--format', '{{.Id}}', name]);
  return r.code === 0 ? r.stdout.trim() : null;
}

/** Every file below a folder (relative paths, sorted), skipping .terraform. */
export function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.terraform') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(p.slice(base.length + 1).replaceAll('\\', '/'));
  }
  return out.sort();
}

export const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/**
 * Run a Node script as its own process, the way a pipeline runs a step. Does not block this process
 * (a state server may live here). Returns { code, out, ms }.
 */
export function runNode(args, { cwd, env = {}, onStart } = {}) {
  return new Promise((done) => {
    const t0 = Date.now();
    let out = '';
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    onStart?.(child);
    child.stdout.setEncoding('utf8').on('data', (d) => { out += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { out += d; });
    child.on('error', (e) => done({ code: 127, out: `${out}${e.message}`, ms: Date.now() - t0 }));
    child.on('close', (code) => done({ code: code ?? 1, out: clean(out), ms: Date.now() - t0 }));
  });
}

const FLAKE = /text file busy|doesn.?t match any of the checksums|Failed to install provider from shared cache|does not match any of the checksums|installed provider plugins are not consistent|Required plugins are not installed/;

/**
 * runNode, with a retry for one known flake: several challenges share one plugin cache folder, and a provider
 * that another run is installing at that moment can make a Terraform step fail once. Only that failure is retried.
 */
export async function runNodeRetry(args, opts = {}) {
  let r;
  for (let i = 0; i < 4; i++) {
    r = await runNode(args, opts);
    if (r.code === 0 || !FLAKE.test(r.out)) break;
    await new Promise((ok) => setTimeout(ok, 5000 * (i + 1)));
  }
  return r;
}
