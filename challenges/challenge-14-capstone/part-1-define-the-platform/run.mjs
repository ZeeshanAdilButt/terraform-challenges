// Challenge 14, part 1: define the platform.
// Run: node challenges/challenge-14-capstone/part-1-define-the-platform/run.mjs
// Add --record to also write results.md and chart.svg. Add --reference (or TFC_REFERENCE=1) to run the solution.
//
// It copies your capstone/ folder to work/, then:
//   1. runs the tests that need no Docker (terraform fmt, terraform test with a mocked provider),
//   2. starts the teaching state server on port 8850 (a token for dev, another for prod),
//   3. builds dev and prod for real, each with its own state, and checks that the platform works:
//      the web container answers, and it can reach the cache container over the network,
//   4. tries a bad input, a prod destroy, and the wrong environment's token,
//   5. destroys everything it made.
// When a step fails (the starter fails on purpose) it records the failure, cleans up and stops.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDocker, cleanup, leftovers, waitFor } from '../../../toolkit/docker.js';
import { Recorder } from '../../../toolkit/record.js';
import { recording, useReference } from '../../../toolkit/part.js';
import { startStateServer } from '../../../toolkit/state-server.mjs';
import { barsSvg } from '../../../toolkit/bars.js';
import { versionLine, mode } from '../../../toolkit/tf.js';
import { N, applyCountsOf, askCacheFromWeb, containers, envRunner, errorBlock, first, grep, httpGet, initTf, listFiles, planCountsOf, prepareCapstone, saveFacts, serverState, short, stable, terra, tail } from '../lib.mjs';
import { envChecks, failing, moduleChecks, testChecks } from '../shape.mjs';

const PORT = 8850;
const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 14, part 1: define the platform');

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const work = prepareCapstone(import.meta.url, 1);
const cap = join(work, 'capstone');
const base = `http://127.0.0.1:${PORT}`;
const tokens = { dev: randomBytes(6).toString('hex'), prod: randomBytes(6).toString('hex') };

// Every fact starts at its "not done" value, so a stopped run never leaves numbers from an older run behind.
const facts = {
  fmt_ok: false,
  tests_passed_count: 0,
  tests_failed_count: -1,
  shape_failing_count: -1,
  validate_dev_ok: false,
  validate_prod_ok: false,
  bad_memory_rejected: false,
  bad_memory_error: '',
  apply_dev_added_count: 0,
  apply_prod_added_count: 0,
  containers_count: 0,
  state_files_count: 0,
  local_tfstate_files_count: -1,
  web_dev_status: 0,
  web_prod_status: 0,
  web_reaches_cache: '',
  outputs_dev_keys_count: 0,
  second_plan_dev_no_changes: false,
  second_plan_prod_no_changes: false,
  wrong_token_denied: false,
  wrong_token_error: '',
  prod_destroy_blocked: false,
  prod_destroy_error: '',
  prod_containers_after_blocked_destroy_count: -1,
  destroy_dev_count: 0,
  destroy_prod_count: 0,
  leftover_count: -1,
};
const save = () => saveFacts('c14.p1', facts);
const stopHere = (why) => {
  console.log(`\nStopped here: ${why}`);
  process.exitCode = 1;
};
let server;

async function main() {
  // 1. The tests that need no Docker.
  const fmt = await terra(cap, ['fmt', '-check', '-recursive'], { docker: false });
  facts.fmt_ok = fmt.code === 0;
  rec.step(
    'terraform fmt -check -recursive',
    fmt.code === 0 ? '(no output: every file is formatted)' : short(fmt.out),
    fmt.code === 0 ? 'fmt -check lists the files that are not in the standard format and exits 3. Nothing listed, exit 0. CI runs this on every push.' : 'These files are not formatted. Run terraform fmt -recursive in capstone/.',
  );

  const init = await initTf(cap, ['init', '-input=false', '-backend=false'], { docker: false });
  if (init.code !== 0) {
    rec.step('terraform init -backend=false', errorBlock(init.out), 'init failed. The message names the file and the problem.');
    return stopHere('terraform init failed in capstone/. Fix the file named in the error.');
  }
  const t = await terra(cap, ['test'], { docker: false, initArgs: ['init', '-input=false', '-backend=false'] });
  const sum = /(Success|Failure)! (\d+) passed, (\d+) failed/.exec(t.out);
  facts.tests_passed_count = sum ? +sum[2] : 0;
  facts.tests_failed_count = sum ? +sum[3] : -1;
  rec.step(
    'cd capstone && terraform init -backend=false && terraform test',
    short(grep(t.out, /^\s+run "|^tests\/.*\.\.\. (pass|fail)$|^(Success|Failure)!|^Error/) || errorBlock(t.out)),
    t.code === 0 ? 'The provider is mocked, so no Docker engine runs. Plan tests, failing-validation tests (expect_failures turns a refusal into a pass) and mock tests: all in about a second each.' : 'terraform test failed. Each failed run block names the assertion that did not hold.',
  );
  facts.shape_failing_count = failing([...moduleChecks(work), ...envChecks(work), ...testChecks(work)]).length;
  if (t.code !== 0 || facts.shape_failing_count > 0) {
    save();
    return stopHere(t.code !== 0 ? 'terraform test failed. Fix the module and the tests, then run this again.' : `${facts.shape_failing_count} parts of the platform are still missing. Run the test (node --test challenges/challenge-14-capstone/part-1-define-the-platform/test.mjs) to see which.`);
  }

  // 2. The state server, with one token per environment.
  server = await startStateServer({ port: PORT, dir: join(work, '.state'), tokens, log: () => {} });
  rec.step(`node toolkit/state-server.mjs --port ${PORT}   (started from run.mjs with a token for dev and a token for prod)`, `State server on port ${PORT}. /state/dev/... needs the dev token, /state/prod/... needs the prod token.`, 'One server, two separate states, two separate credentials. The tokens are made up for this run and are only ever passed through TF_HTTP_PASSWORD.');
  const dev = envRunner({ work, env: 'dev', base, token: tokens.dev });
  const prod = envRunner({ work, env: 'prod', base, token: tokens.prod });
  const inits = { dev: await dev.init(), prod: await prod.init() };
  rec.step(
    'cd capstone/envs/dev && terraform init -backend-config=backend.hcl\ncd capstone/envs/prod && terraform init -backend-config=backend.hcl',
    `dev:  ${first(inits.dev.out, /Successfully configured the backend/) || errorBlock(inits.dev.out, 4)}\nprod: ${first(inits.prod.out, /Successfully configured the backend/) || errorBlock(inits.prod.out, 4)}\n${grep(inits.dev.out, /module\.service|Installing|Reusing|Using/).split('\n').slice(0, 3).join('\n')}`,
    'Two folders, two .terraform directories, two state names (dev/platform and prod/platform). Both call the same module.',
  );
  if (inits.dev.code !== 0 || inits.prod.code !== 0) return stopHere('terraform init failed in an environment. The message above names the problem.');

  const vd = await dev.run(['validate']);
  const vp = await prod.run(['validate']);
  facts.validate_dev_ok = vd.code === 0;
  facts.validate_prod_ok = vp.code === 0;
  rec.step('terraform validate   (in envs/dev and in envs/prod)', `dev:  ${first(vd.out, /Success|Error/) || errorBlock(vd.out, 6)}\nprod: ${first(vp.out, /Success|Error/) || errorBlock(vp.out, 6)}`, 'validate checks the syntax and the references, with no state and no Docker.');
  if (!facts.validate_dev_ok || !facts.validate_prod_ok) {
    save();
    return stopHere('terraform validate failed. Fix the file named in the error.');
  }

  // 3. A bad input, for real.
  const bad = await dev.run(['plan', '-input=false', '-var', 'memory_mb=4096']);
  facts.bad_memory_rejected = bad.code !== 0 && /memory_mb must be between/.test(bad.out);
  facts.bad_memory_error = first(bad.out, /memory_mb must be between/).replace(/^[│\s]+/, '');
  rec.step('cd capstone/envs/dev && terraform plan -var memory_mb=4096', short(errorBlock(bad.out, 12) || tail(bad.out, 5)), facts.bad_memory_rejected ? 'The module refuses a memory limit outside 16 to 256 MB before anything is planned, and says where the rule is written.' : 'The plan accepted 4096 MB. The module has no rule against it.');

  // 4. Build both environments.
  const aDev = await dev.run(['apply', '-auto-approve', '-input=false']);
  const aProd = await prod.run(['apply', '-auto-approve', '-input=false']);
  const cDev = applyCountsOf(aDev.out);
  const cProd = applyCountsOf(aProd.out);
  facts.apply_dev_added_count = cDev?.added ?? 0;
  facts.apply_prod_added_count = cProd?.added ?? 0;
  rec.step(
    'cd capstone/envs/dev && terraform apply -auto-approve\ncd capstone/envs/prod && terraform apply -auto-approve',
    short(`dev:\n${grep(stable(aDev.out), /Creation complete|Apply complete|^Error/) || errorBlock(aDev.out, 8)}\nprod:\n${grep(stable(aProd.out), /Apply complete|^Error/) || errorBlock(aProd.out, 8)}`),
    cDev && cProd ? 'Six objects per environment: two images, a volume, a network, the cache container and the web container.' : 'An apply failed. Read the error: it names the resource.',
  );
  if (!cDev || !cProd) return stopHere('an apply failed. The error above names the resource and the reason.');

  const stateFiles = listFiles(server.dir);
  const sDev = serverState(server, 'dev/platform');
  const sProd = serverState(server, 'prod/platform');
  const names = containers();
  facts.state_files_count = stateFiles.filter((f) => f.endsWith('.json')).length;
  facts.containers_count = names.length;
  facts.local_tfstate_files_count = ['dev', 'prod'].filter((e) => existsSync(join(cap, 'envs', e, 'terraform.tfstate'))).length;
  rec.step(
    'ls .state ; docker ps -a --filter label=tfc.challenge=14 --format {{.Names}}',
    `${stateFiles.join('\n')}\ndev state:  serial ${sDev?.serial}, ${sDev?.resources} resources\nprod state: serial ${sProd?.serial}, ${sProd?.resources} resources\n${names.join('\n')}`,
    'One state file per environment on the server, and no terraform.tfstate in either folder. Each state is its own blast radius.',
  );

  // 5. The platform really works: web answers, web reaches cache.
  const webUrl = { dev: 'http://127.0.0.1:18401', prod: 'http://127.0.0.1:18402' };
  const answers = {};
  for (const e of ['dev', 'prod']) {
    try {
      answers[e] = await waitFor(async () => {
        const r = await httpGet(webUrl[e]);
        return r.status ? r : null;
      }, { timeoutMs: 30_000, what: `the ${e} web container to answer` });
    } catch {
      answers[e] = { status: 0, body: '' };
    }
  }
  facts.web_dev_status = answers.dev.status;
  facts.web_prod_status = answers.prod.status;
  const pong = askCacheFromWeb('tfc-c14-dev-web', 'tfc-c14-dev-cache', 'PING');
  facts.web_reaches_cache = pong;
  const outJson = await dev.run(['output', '-json']);
  let keys = [];
  try {
    keys = Object.keys(JSON.parse(outJson.out));
  } catch { /* not json */ }
  facts.outputs_dev_keys_count = keys.length;
  rec.step(
    `curl ${webUrl.dev} ; curl ${webUrl.prod}\ndocker exec tfc-c14-dev-web  (PING sent to tfc-c14-dev-cache:6379)\nterraform output -json   (in envs/dev, keys)`,
    `dev  web: HTTP ${answers.dev.status}  ${first(answers.dev.body, /<title>/)}\nprod web: HTTP ${answers.prod.status}  ${first(answers.prod.body, /<title>/)}\ncache answered the web container with: ${pong}\noutput keys: ${keys.join(', ')}`,
    'Created is not working. The web container answers on its own port, and it reaches the cache by name over the platform network. The mocked tests cannot know either.',
  );

  // 6. A second plan: nothing to do.
  const p2d = await dev.run(['plan', '-input=false', '-detailed-exitcode']);
  const p2p = await prod.run(['plan', '-input=false', '-detailed-exitcode']);
  facts.second_plan_dev_no_changes = p2d.code === 0 && /No changes/.test(p2d.out);
  facts.second_plan_prod_no_changes = p2p.code === 0 && /No changes/.test(p2p.out);
  rec.step('terraform plan -detailed-exitcode   (envs/dev, envs/prod)', `dev:  exit ${p2d.code}  ${first(p2d.out, /No changes|^Plan:/)}\nprod: exit ${p2p.code}  ${first(p2p.out, /No changes|^Plan:/)}`, 'Exit code 0 and "No changes": the code and the real platform agree.');

  // 7. Credentials: the dev token does not open prod.
  const wrong = await prod.withToken(tokens.dev).init();
  facts.wrong_token_denied = wrong.code !== 0 && /requires auth/.test(wrong.out);
  facts.wrong_token_error = first(wrong.out, /^Error/).replace(/^Error: /, '');
  rec.step('cd capstone/envs/prod && TF_HTTP_PASSWORD=<the dev token> terraform init -reconfigure -backend-config=backend.hcl', errorBlock(wrong.out, 4) || tail(wrong.out, 3), facts.wrong_token_denied ? 'The state server answers 401 for the dev token on a prod state. Terraform cannot even read prod, so it cannot plan or apply there.' : 'The dev token opened the prod state. The credentials are not separate.');
  await prod.init();

  // 8. prod refuses to be destroyed.
  const dp = await prod.run(['destroy', '-auto-approve', '-input=false']);
  facts.prod_destroy_blocked = dp.code !== 0 && /prevent_destroy/.test(dp.out);
  facts.prod_destroy_error = first(dp.out, /^Error/).replace(/^Error: /, '');
  facts.prod_containers_after_blocked_destroy_count = containers().filter((n) => n.includes('prod')).length;
  rec.step('cd capstone/envs/prod && terraform destroy -auto-approve', short(facts.prod_destroy_blocked ? errorBlock(dp.out, 10) : tail(dp.out, 3)), facts.prod_destroy_blocked ? 'prevent_destroy on the data volume stops the whole destroy at plan time. Nothing was removed.' : 'Nothing stopped it. The prod platform is gone.');

  // 9. Clean up: dev is thrown away; prod needs its guard removed in this work copy first.
  const dd = await dev.run(['destroy', '-auto-approve', '-input=false']);
  facts.destroy_dev_count = Number(/Destroy complete! Resources: (\d+) destroyed/.exec(dd.out)?.[1] ?? 0);
  rec.step('cd capstone/envs/dev && terraform destroy -auto-approve', tail(dd.out, 1), 'Dev is meant to be thrown away, so nothing guards it.');
  const prodMain = join(prod.dir, 'main.tf');
  const prodOriginal = readFileSync(prodMain, 'utf8');
  writeFileSync(prodMain, prodOriginal.replace(/\n {2}lifecycle \{\n {4}prevent_destroy = true\n {2}\}\n/, '\n'));
  const dpp = await prod.run(['destroy', '-auto-approve', '-input=false']);
  writeFileSync(prodMain, prodOriginal);
  facts.destroy_prod_count = Number(/Destroy complete! Resources: (\d+) destroyed/.exec(dpp.out)?.[1] ?? 0);
  rec.step('(remove the lifecycle block in this work copy)  cd capstone/envs/prod && terraform destroy -auto-approve', tail(dpp.out, 1), 'This is how the part cleans up. In real life you would stop and ask who removed the guard, and why.');
}

try {
  cleanup(N);
  save();
  await main();
} catch (e) {
  console.error(`\nStopped: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  if (server) await server.close();
  cleanup(N);
  const left = leftovers(N);
  facts.leftover_count = left.containers + left.networks + left.volumes;
  save();
  rec.step(`docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=${N})`, `${left.containers} containers, ${left.networks} networks, ${left.volumes} volumes`, 'Everything this part built is gone. The images stay on your machine (keep_locally).');
  if (recording() && useReference() && facts.destroy_prod_count > 0) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, Engine ${engine}, ${versionLine()} (${mode()} mode), Node ${process.versions.node}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Terraform test runs in the reference platform, by kind of test',
        unit: 'runs',
        bars: [
          { label: 'plan tests', value: 3 },
          { label: 'failing validation', value: 5 },
          { label: 'mock apply', value: 3 },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nSee your numbers with: node toolkit/show-facts.mjs c14.p1');
}
