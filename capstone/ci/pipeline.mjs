// The steps of the pipeline, as one script that your workflow and your own machine both run.
// This file is part of the template. Do not edit it: the checker compares it with the template's copy.
//
//   node capstone/ci/pipeline.mjs check <env>    format, init, validate (no state, no Docker engine needed)
//   node capstone/ci/pipeline.mjs plan  <env>    plan, save the plan, turn it into JSON, run the plan gate
//   node capstone/ci/pipeline.mjs apply <env>    apply the saved plan of that environment, and nothing else
//
// <env> is dev or prod. The state lives on a state server (node toolkit/state-server.mjs --port 8850). Tell the script
// where it is with TFC_STATE_URL, for example http://127.0.0.1:8850. The name of each environment's state comes from
// capstone/envs/<env>/backend.hcl. A token, when the server wants one, comes from TF_HTTP_USERNAME and TF_HTTP_PASSWORD.
//
// Exit codes: 0 the step passed. 1 the step failed, or the gate blocked the plan. 2 wrong use (no plan file, no state URL).

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function findToolkit() {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const p = join(d, 'toolkit', 'tf.js');
    if (existsSync(p)) return p;
    d = dirname(d);
  }
  throw new Error('Could not find toolkit/tf.js above this script.');
}

const [step, env] = process.argv.slice(2);
const capstone = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!['check', 'plan', 'apply'].includes(step) || !['dev', 'prod'].includes(env)) {
  console.error('Usage: node capstone/ci/pipeline.mjs <check|plan|apply> <dev|prod>');
  process.exit(2);
}

const { tfAsync, hostName } = await import(pathToFileURL(findToolkit()).href);
const chdir = `-chdir=envs/${env}`;
const planFile = `${env}.tfplan`;
const planJson = `${env}.plan.json`;
const clean = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n');
// The credentials reach Terraform through the environment. In docker mode the toolkit passes only the variables named here.
const credentials = Object.fromEntries(['TF_HTTP_USERNAME', 'TF_HTTP_PASSWORD'].filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
const tfc = async (args) => {
  const r = await tfAsync(args, { cwd: capstone, docker: true, env: credentials });
  return { code: r.code, out: clean(r.out) };
};
// A short Markdown note for the job summary page on GitHub (the page you open from a pull request). Not printed here.
const summary = (text) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n`);
};
const lines = (out, re, n = 12) => clean(out).split('\n').map((l) => l.replace(/^[│╷╵]\s?/, '').trimEnd()).filter((l) => re.test(l)).slice(0, n).join('\n');
const errors = (out) => {
  const all = clean(out).split('\n').map((l) => l.replace(/^[│╷╵]\s?/, '').trimEnd());
  const i = Math.max(all.findIndex((l) => l.startsWith('Error')), 0);
  return all.slice(i).filter((l) => l.trim()).slice(0, 14).join('\n');
};

/** The -backend-config arguments: backend.hcl of the environment, with the address of the state server filled in. */
function backendArgs() {
  const url = process.env.TFC_STATE_URL;
  if (!url) {
    console.error('pipeline: TFC_STATE_URL is not set. Start a state server and set it, for example TFC_STATE_URL=http://127.0.0.1:8850');
    process.exit(2);
  }
  const u = new URL(url);
  const host = ['127.0.0.1', 'localhost'].includes(u.hostname) ? hostName() : u.hostname;
  const origin = `http://${host}:${u.port}`;
  const args = [];
  for (const line of readFileSync(join(capstone, 'envs', env, 'backend.hcl'), 'utf8').split('\n')) {
    const m = /^\s*(\w+)\s*=\s*"([^"]*)"/.exec(line);
    if (!m) continue;
    const [, k, v] = m;
    args.push(`-backend-config=${k}=${/^https?:\/\//.test(v) ? v.replace(/^https?:\/\/[^/]+/, origin) : v}`);
  }
  return args;
}

async function must(label, args) {
  const r = await tfc(args);
  console.log(`terraform ${args.filter((a) => !a.startsWith('-backend-config=') && !a.startsWith('-chdir=')).join(' ')} ... ${r.code === 0 ? 'ok' : `FAILED (exit ${r.code})`}`);
  if (r.code !== 0) {
    console.log(errors(r.out));
    summary(`**${env}: failed at the ${label} step**\n\n\`\`\`text\n${errors(r.out)}\n\`\`\``);
    process.exit(1);
  }
  return r;
}

if (step === 'check') {
  const fmt = await tfc(['fmt', '-check', '-recursive']);
  console.log(`terraform fmt -check -recursive ... ${fmt.code === 0 ? 'ok' : `FAILED (exit ${fmt.code})`}`);
  if (fmt.code !== 0) {
    console.log(fmt.out.trim());
    summary(`**${env}: failed at the fmt step.** These files are not formatted:\n\n\`\`\`text\n${fmt.out.trim()}\n\`\`\``);
    process.exit(1);
  }
  await must('init', [chdir, 'init', '-input=false', '-backend=false']);
  await must('validate', [chdir, 'validate']);
  summary(`**${env}: format and validate passed.**`);
}

if (step === 'plan') {
  await must('init', [chdir, 'init', '-input=false', '-reconfigure', ...backendArgs()]);
  const plan = await must('plan', [chdir, 'plan', '-input=false', '-lock-timeout=60s', `-out=${planFile}`]);
  const shown = await must('show', [chdir, 'show', '-json', planFile]);
  writeFileSync(join(capstone, 'envs', env, planJson), shown.out);
  const counts = lines(plan.out, /^Plan:|^No changes/, 1) || 'Plan: unknown';
  console.log(counts);
  const gate = spawnSync(process.execPath, [join(capstone, 'gate', 'plan-gate.mjs'), join(capstone, 'envs', env, planJson)], { encoding: 'utf8' });
  console.log(`node capstone/gate/plan-gate.mjs ${env}/${planJson} ... exit ${gate.status}`);
  const verdict = `${gate.stdout}${gate.stderr}`.trim();
  console.log(verdict);
  summary(`**${env}: ${counts}**\n\nPlan gate (exit ${gate.status}):\n\n\`\`\`text\n${verdict}\n\`\`\``);
  if (gate.status !== 0) process.exit(1);
  console.log(`Wrote ${env}/${planFile} and ${env}/${planJson}`);
}

if (step === 'apply') {
  if (!existsSync(join(capstone, 'envs', env, planFile))) {
    console.error(`pipeline: there is no plan file envs/${env}/${planFile}. Run the plan step first and keep its file.`);
    process.exit(2);
  }
  await must('init', [chdir, 'init', '-input=false', '-reconfigure', ...backendArgs()]);
  const apply = await must('apply', [chdir, 'apply', '-input=false', '-lock-timeout=60s', planFile]);
  console.log(lines(apply.out, /^Apply complete/, 1));
  summary(`**${env}: ${lines(apply.out, /^Apply complete/, 1) || 'applied'}**`);
}
