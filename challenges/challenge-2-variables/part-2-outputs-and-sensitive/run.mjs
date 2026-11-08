// Challenge 2, part 2: outputs and sensitive values.
// Run: node challenges/challenge-2-variables/part-2-outputs-and-sensitive/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
//
// It shows the error for an output that forgot "sensitive = true", then applies your main.tf and looks for the
// secret in every place Terraform can show it: apply output, `output`, `output NAME`, `-raw`, `-json`,
// `show` and the state file. The password is generated and the token is made up; neither opens anything.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { barsSvg } from '../../../toolkit/bars.js';
import { setFact } from '../../../toolkit/facts.js';
import { prepareWork, recording } from '../../../toolkit/part.js';
import { Recorder } from '../../../toolkit/record.js';
import { applyCounts, mode } from '../../../toolkit/tf.js';
import { errorBlock, section, tfx } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 2, part 2: outputs and sensitive values');
const work = prepareWork(import.meta.url, { keep: ['.terraform.lock.hcl'] });
const TOKEN = 'tfc-demo-token-not-real'; // made up
const env = { TF_VAR_api_token: TOKEN };
const opts = (cwd = work) => ({ cwd, env });

try {
  // Step 1: the error you get for an output that forgot sensitive = true. A tiny separate configuration.
  const demo = join(work, 'demo-unmarked');
  mkdirSync(demo, { recursive: true });
  writeFileSync(
    join(demo, 'main.tf'),
    'variable "api_token" {\n  type      = string\n  sensitive = true\n}\n\noutput "token_echo" {\n  value = var.api_token\n}\n',
  );
  const demoPlan = tfx(['plan'], opts(demo));
  const unmarkedRejected = demoPlan.code !== 0 && /Output refers to sensitive values/.test(demoPlan.out);
  rec.step(
    'terraform plan   (a separate demo: an output of a sensitive variable, without sensitive = true)',
    errorBlock(demoPlan.out, 14),
    'Terraform refuses to plan. An output is meant to be read by people and other tools, so it must say, in writing, that it is sensitive. This is the error your starter main.tf gives you too.',
  );

  // Step 2: your configuration.
  const init = tfx(['init'], opts());
  if (init.code !== 0) throw new Error(`terraform init failed:\n${init.out}`);
  const apply = tfx(['apply', '-auto-approve'], opts());
  const ac = applyCounts(apply.out);
  const applyOk = apply.code === 0 && ac !== null;
  if (!applyOk) {
    rec.step('terraform apply -auto-approve   (your main.tf)', errorBlock(apply.out, 14), 'The apply stopped. Read the error: the two outputs built from sensitive values must be marked sensitive = true.');
    setFact('c2.p2.unmarked_output_rejected', unmarkedRejected);
    setFact('c2.p2.apply_ok', false);
    throw new Error('Your main.tf did not apply. Fix the error above (mark the outputs sensitive), then run again.');
  }
  rec.step(
    'terraform apply -auto-approve   (your main.tf, lines from "Changes to Outputs")',
    section(apply.out, /Changes to Outputs/, 18),
    'Terraform prints <sensitive> instead of the values, in the plan part and in the final outputs. The password was generated, so it did not exist in any file you wrote.',
  );

  // The secrets.
  const outJson = JSON.parse(tfx(['output', '-json'], opts()).stdout);
  const password = outJson.db_password?.value ?? '';
  const sensitiveCount = Object.values(outJson).filter((o) => o.sensitive).length;
  const outList = tfx(['output'], opts()).stdout;
  const outNamed = tfx(['output', 'db_password'], opts()).stdout;
  const outRaw = tfx(['output', '-raw', 'db_password'], opts()).stdout;
  const show = tfx(['show'], opts()).stdout;
  const stateText = readFileSync(join(work, 'terraform.tfstate'), 'utf8');
  const count = (text, needle) => (needle ? text.split(needle).length - 1 : 0);

  // Step 3: the ways to read an output.
  rec.step(
    'terraform output ; terraform output db_password ; terraform output -raw db_password',
    `$ terraform output\n${outList.trim()}\n$ terraform output db_password\n${outNamed.trim()}\n$ terraform output -raw db_password\n${outRaw.trim()}`,
    'The list hides sensitive outputs. Asking for one by name, or with -raw, prints it: the mark only stops accidents on screen, it does not lock anything.',
  );
  const jsonShown = JSON.stringify({ db_password: outJson.db_password }, null, 2);
  rec.step('terraform output -json   (the db_password entry)', jsonShown, 'JSON output has a "sensitive": true flag for programs to read, and the plain value next to it. Anyone who can run this command can read the secret.');

  // Step 4: show, and a mark that does not follow the value.
  const showLines = show.split('\n');
  const startAt = showLines.findIndex((l) => /^# terraform_data\.service/.test(l));
  const resultLine = showLines.find((l) => /^\s+result\s+=/.test(l)) ?? '';
  rec.step(
    'terraform show   (the password line and the terraform_data block)',
    `${resultLine.trimEnd()}\n${showLines.slice(startAt, startAt + 12).join('\n')}`,
    'show hides the password, and hides the token in "input". But the same token appears in plain text in the "output" attribute of terraform_data. A sensitive mark follows a value through expressions, not through every attribute a provider fills in.',
  );

  // Step 5: the state file.
  const stateLines = stateText.split('\n');
  const pick = (needle) => {
    const i = stateLines.findIndex((l) => l.includes(needle));
    return i < 0 ? '(not found)' : `terraform.tfstate line ${i + 1}: ${stateLines[i].trim()}`;
  };
  rec.step(
    'grep the state file for the password and for the token',
    `${pick(password)}\npassword appears ${count(stateText, password)} time(s) in terraform.tfstate\n${pick(TOKEN)}\ntoken appears ${count(stateText, TOKEN)} time(s) in terraform.tfstate`,
    'State is a plain JSON file. Marking a value sensitive hides it on screen; it stays in state in clear text. That is why state files need the care you give a password file.',
  );

  // Facts.
  const has = (text, s) => Boolean(s) && text.includes(s);
  setFact('c2.p2.unmarked_output_rejected', unmarkedRejected);
  setFact('c2.p2.apply_ok', true);
  setFact('c2.p2.apply_added_count', ac.added);
  setFact('c2.p2.sensitive_outputs_count', sensitiveCount);
  setFact('c2.p2.apply_log_redacted', !has(apply.out, password) && !has(apply.out, TOKEN) && /<sensitive>/.test(apply.out));
  setFact('c2.p2.output_list_redacted', !has(outList, password) && (outList.match(/<sensitive>/g) ?? []).length === 2);
  setFact('c2.p2.output_named_leaks', has(outNamed, password));
  setFact('c2.p2.output_raw_leaks', has(outRaw, password));
  setFact('c2.p2.output_json_leaks', has(JSON.stringify(outJson), password));
  setFact('c2.p2.show_hides_password', !has(show, password));
  setFact('c2.p2.show_leaks_token_in_output_attribute', has(show, TOKEN));
  setFact('c2.p2.state_has_password', has(stateText, password));
  setFact('c2.p2.state_has_token', has(stateText, TOKEN));
  setFact('c2.p2.state_password_count', count(stateText, password));

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, Docker Desktop, runner mode ${mode()}, Node ${process.versions.node}`);
    const seen = (b) => (b ? 1 : 0);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Where the generated password shows in clear text (1 = visible, 0 = hidden)',
        unit: '',
        bars: [
          { label: 'apply output', value: seen(has(apply.out, password)) },
          { label: 'terraform output', value: seen(has(outList, password)) },
          { label: 'terraform show', value: seen(has(show, password)) },
          { label: 'output db_password', value: seen(has(outNamed, password)) },
          { label: 'output -raw', value: seen(has(outRaw, password)) },
          { label: 'output -json', value: seen(has(JSON.stringify(outJson), password)) },
          { label: 'terraform.tfstate', value: seen(has(stateText, password)) },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c2.p2');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
}
