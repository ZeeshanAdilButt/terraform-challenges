// Challenge 13, part 3 test.
// Run: node --test challenges/challenge-13-upgrade-and-recover/part-3-same-code-on-opentofu/test.mjs
// It runs your folder with OpenTofu 1.13.9 (the pinned image), with the passphrase in TF_VAR_state_passphrase,
// and checks that terraform.tfstate is encrypted, that OpenTofu can still plan, and that Terraform refuses the state.
// No Docker objects are made.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { prepareWork } from '../../../toolkit/part.js';
import { tfx, withTool, read, counts } from '../lib.mjs';

const ENV = { TF_VAR_state_passphrase: 'tfc-c13-demo-passphrase-1' };
let work;
let init;
let apply;
let plan;
let tfPlan;
let stateText = '';

before(() => {
  work = prepareWork(import.meta.url);
  withTool('tofu', () => {
    init = tfx(['init'], work, { env: ENV });
    if (init.code !== 0) return;
    apply = tfx(['apply', '-auto-approve'], work, { env: ENV });
    stateText = read(join(work, 'terraform.tfstate'));
    plan = tfx(['plan'], work, { env: ENV });
  });
  // Terraform ignores .tofu files, so it sees the same code and the encrypted state.
  tfPlan = withTool('terraform', () => tfx(['plan'], work, { env: ENV }));
});

test('OpenTofu initialises and applies the folder', () => {
  assert.equal(init.code, 0, `tofu init failed:\n${init.out.slice(0, 1500)}\nCheck encryption.tofu: the blocks must be valid, and the variable state_passphrase must be declared.`);
  assert.match(apply?.out ?? '', /Apply complete! Resources: 4 added/, `tofu apply did not finish:\n${(apply?.out ?? '').slice(0, 1500)}`);
});

test('terraform.tfstate is encrypted', () => {
  assert.match(stateText, /"encrypted_data"/, 'The state file is plain JSON. Add the encryption block to encryption.tofu: a pbkdf2 key provider, an aes_gcm method and a state block that uses the method.');
  assert.doesNotMatch(stateText, /random_pet/, 'The resource names are still readable in the state file.');
});

test('OpenTofu can still read and plan the encrypted state', () => {
  const c = counts(plan?.out ?? '');
  assert.ok(c, `tofu plan printed no result:\n${(plan?.out ?? '').slice(0, 1200)}`);
  assert.equal(c.add + c.change + c.destroy, 0, `The plan is not empty:\n${plan.out.slice(0, 1200)}`);
});

test('Terraform refuses the encrypted state', () => {
  assert.notEqual(tfPlan.code, 0, 'Terraform planned successfully, so the state is not encrypted.');
  assert.match(tfPlan.out, /Unsupported state file format/, `Terraform failed for another reason:\n${tfPlan.out.slice(0, 1200)}`);
});
