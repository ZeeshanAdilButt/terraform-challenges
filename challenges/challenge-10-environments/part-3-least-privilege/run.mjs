// Challenge 10, part 3: least privilege by token.
// Run: node challenges/challenge-10-environments/part-3-least-privilege/run.mjs
// Add --record to also write results.md next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the solution instead of your files.
//
// It starts the teaching state server inside this process on port 8821 with one token per environment
// ("dev" and "prod"; the server lets a request through only when it carries the token named like the first part of
// the state name). It builds both environments with a platform admin who holds both tokens. Then four identities
// try to plan in both folders: a developer, a CI job for dev, a CI job for prod, and a laptop with no credentials.
// What each identity holds comes from identities.json (the policy you edit) and from the files in envs/.
// Terraform runs through tfAsync because the server lives in this very process.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, leftovers, assertDocker } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { hostName, versionLine, mode } from '../../../toolkit/tf.js';
import { startStateServer } from '../../../toolkit/state-server.mjs';
import { N, terra, initWork, tail, errorBlock, listFiles } from '../lib/common.mjs';

const PORT = 8821;
// The "secret store": the only place the tokens live in this run. They are teaching values, not secrets.
const SECRETS = { dev: 'dev-token-demo', prod: 'prod-token-demo' };
const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 10, part 3: least privilege by token');

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareWork(import.meta.url);
const envDir = (e) => join(work, 'envs', e);
const BACKEND = ['-backend-config=backend.hcl', '-backend-config=backend.addr.hcl'];
const policy = JSON.parse(readFileSync(join(work, 'identities.json'), 'utf8'));
let server;

const serial = (e) => {
  const p = join(server.dir, e, 'app.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).serial : null;
};

/** What the identity puts in TF_HTTP_PASSWORD when it works in folder env: the token of that environment if the
 *  policy grants it, otherwise the first token it has (a person tries what they hold). No grant at all: nothing. */
function credentials(identity, env) {
  const granted = policy[identity] || [];
  const token = granted.includes(env) ? SECRETS[env] : granted.length ? SECRETS[granted[0]] : undefined;
  return token ? { TF_HTTP_PASSWORD: token } : {};
}

/** init, then plan, in one environment folder as one identity. */
async function attempt(identity, env) {
  const opts = { env: credentials(identity, env), initArgs: BACKEND };
  const init = await terra(envDir(env), ['init', '-reconfigure', '-input=false', ...BACKEND], opts);
  if (init.code !== 0) return { identity, env, ok: false, step: 'init', out: init.out };
  const plan = await terra(envDir(env), ['plan', '-input=false'], opts);
  return { identity, env, ok: plan.code === 0, step: 'plan', out: plan.out };
}

try {
  cleanup(N);
  server = await startStateServer({ port: PORT, dir: join(work, '.state'), tokens: SECRETS, log: () => {} });
  const host = hostName();
  for (const e of ['dev', 'prod']) {
    writeFileSync(
      join(envDir(e), 'backend.addr.hcl'),
      `address        = "http://${host}:${PORT}/state/${e}/app"\nlock_address   = "http://${host}:${PORT}/lock/${e}/app"\nunlock_address = "http://${host}:${PORT}/lock/${e}/app"\n`,
    );
  }
  rec.step(
    `node toolkit/state-server.mjs --port ${PORT}   (started from run.mjs with tokens for "dev" and "prod")`,
    `State server on port ${PORT}. A request to /state/dev/... needs the dev token, /state/prod/... needs the prod token.`,
    'The server checks the first part of the state name against a token of that name. This is the teaching version of "this identity may use this state".',
  );

  // the platform admin builds both environments
  for (const e of ['dev', 'prod']) {
    const i = await initWork(envDir(e), BACKEND, { env: { TF_HTTP_PASSWORD: SECRETS[e] } });
    if (i.code !== 0) throw new Error(i.out);
  }
  const built = [];
  for (const e of ['dev', 'prod']) {
    const a = await terra(envDir(e), ['apply', '-auto-approve', '-input=false'], { env: { TF_HTTP_PASSWORD: SECRETS[e] }, initArgs: BACKEND });
    built.push(`${e}: ${tail(a.out, 3).split('\n').find((l) => /Apply complete/.test(l)) || tail(a.out, 1)}`);
  }
  const prodSerial0 = serial('prod');
  rec.step(
    'platform admin, with both tokens:\ncd envs/dev && terraform apply -auto-approve\ncd envs/prod && terraform apply -auto-approve',
    built.join('\n'),
    'Somebody has to hold both tokens to build the two environments. In real life that is a platform team, or the pipeline of each environment, not every developer.',
  );

  // what is in the files
  const files = listFiles(work).filter((f) => !f.startsWith('.state/') && !f.endsWith('.tfplan') && !f.startsWith('.terraform'));
  const leaking = files.filter((f) => !f.includes('.terraform/') && Object.values(SECRETS).some((t) => readFileSync(join(work, f), 'utf8').includes(t)));
  rec.step(
    'grep -rl "-token-demo" envs identities.json',
    leaking.length ? leaking.join('\n') : '(no file contains a token)',
    leaking.length
      ? 'A token in a file is in Git, in every clone and in every CI log that prints the file. Everybody who can read the repository holds that environment.'
      : 'No token is in the repository. Each identity gets its token from the environment variable TF_HTTP_PASSWORD, from a secret store.',
  );

  // the matrix
  const tries = [
    ['dev-engineer', 'dev'],
    ['dev-engineer', 'prod'],
    ['nobody', 'dev'],
    ['ci-dev', 'dev'],
    ['ci-dev', 'prod'],
    ['ci-prod', 'prod'],
    ['ci-prod', 'dev'],
  ];
  const res = {};
  for (const [who, env] of tries) res[`${who}>${env}`] = await attempt(who, env);
  const why = (r) => (errorBlock(r.out, 1) || 'no error line').replace(/^Error: /, '');
  const line = (r) => `${r.identity.padEnd(13)} in envs/${r.env.padEnd(5)} ${r.ok ? 'allowed' : `DENIED at ${r.step.padEnd(4)} ${why(r)}`}`;

  const dp = res['dev-engineer>prod'];
  rec.step(
    'a developer who holds only the dev token:\ncd envs/prod && terraform init -reconfigure -backend-config=backend.hcl -backend-config=backend.addr.hcl',
    dp.ok ? '(allowed: terraform init and plan both worked)' : errorBlock(dp.out, 12),
    dp.ok
      ? 'The developer reached the prod state. The password written in envs/prod/backend.hcl is used instead of the one in the environment.'
      : 'The state server answered 401. Terraform cannot even read the prod state, so it cannot plan or apply there. The prod containers cannot be reached by mistake from this identity.',
  );

  rec.step(
    'every identity, in both folders: terraform init, then terraform plan',
    tries.map(([w, e]) => line(res[`${w}>${e}`])).join('\n'),
    'The aim is one "allowed" per identity (its own environment) and "DENIED" everywhere else, including for a laptop with no credentials.',
  );

  // CI for dev can apply in dev
  writeFileSync(join(envDir('dev'), 'main.tf'), readFileSync(join(envDir('dev'), 'main.tf'), 'utf8').replace('GREETING=hello', 'GREETING=hello-ci'));
  const ciApply = await terra(envDir('dev'), ['apply', '-auto-approve', '-input=false'], { env: credentials('ci-dev', 'dev'), initArgs: BACKEND });
  rec.step(
    'the CI job for dev changes the dev greeting:\ncd envs/dev && terraform apply -auto-approve',
    tail(ciApply.out, 3).split('\n').find((l) => /Apply complete|Error/.test(l)) || tail(ciApply.out, 2),
    'The identity of an environment can do its whole job there: read, lock, write.',
  );
  const prodSerial1 = serial('prod');
  const denied = server.events.filter((x) => x.code === 401);
  rec.step(
    'the denied tries, as the server saw them',
    `${denied.length} requests answered 401 (${[...new Set(denied.map((x) => `${x.method} ${x.path.split('/').slice(0, 3).join('/')}`))].join(', ')})\nprod state serial before and after all tries: ${prodSerial0} and ${prodSerial1}`,
    'A denied request changes nothing. The prod state kept its serial number through every try.',
  );

  // facts
  setFact('c10.p3.secrets_in_files_count', leaking.length);
  setFact('c10.p3.dev_engineer_dev_ok', res['dev-engineer>dev'].ok);
  setFact('c10.p3.dev_engineer_prod_denied', !res['dev-engineer>prod'].ok);
  setFact('c10.p3.nobody_denied', !res['nobody>dev'].ok);
  setFact('c10.p3.ci_dev_dev_ok', res['ci-dev>dev'].ok);
  setFact('c10.p3.ci_dev_prod_denied', !res['ci-dev>prod'].ok);
  setFact('c10.p3.ci_prod_prod_ok', res['ci-prod>prod'].ok);
  setFact('c10.p3.ci_prod_dev_denied', !res['ci-prod>dev'].ok);
  setFact('c10.p3.denied_requests_count', denied.length);
  setFact('c10.p3.prod_serial_unchanged', prodSerial0 === prodSerial1);
  setFact('c10.p3.denial_text', dp.ok ? 'not denied' : errorBlock(dp.out, 3).split('\n').join(' '));
  setFact('c10.p3.ci_dev_apply_ok', ciApply.code === 0);

  // cleanup: the admin destroys both
  for (const e of ['dev', 'prod']) {
    await terra(envDir(e), ['init', '-reconfigure', '-input=false', ...BACKEND], { env: { TF_HTTP_PASSWORD: SECRETS[e] } });
    await terra(envDir(e), ['destroy', '-auto-approve', '-input=false'], { env: { TF_HTTP_PASSWORD: SECRETS[e] }, initArgs: BACKEND });
  }
  await server.close();
  server = null;
  const left = leftovers(N);
  setFact('c10.p3.leftover_count', left.containers + left.networks + left.volumes);
  rec.step(
    `platform admin: terraform destroy in both folders, then docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=${N})`,
    `${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes`,
    'The server is stopped and everything this part built is gone.',
  );

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, ${versionLine()} (${mode()} mode), Node ${process.versions.node}`);
    console.log('\nWrote results.md');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c10.p3');
} catch (e) {
  console.error(`\nStopped: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  if (server) await server.close();
  cleanup(N);
}
