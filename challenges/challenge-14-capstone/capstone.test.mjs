// The capstone checks that need no Docker. CI runs this file on every push (.github/workflows/ci.yml).
// Run it yourself:  node --test challenges/challenge-14-capstone/capstone.test.mjs
// It reads capstone/ and .github/workflows/terraform.yml of this repository and runs your plan gate on small made-up plans.
// Each check is one test. A failing test says what to change. Set TFC_CAPSTONE_ROOT to look at another folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { HERE } from './lib.mjs';
import { allChecks } from './shape.mjs';

const root = resolve(process.env.TFC_CAPSTONE_ROOT || resolve(HERE, '..', '..'));

for (const c of allChecks(root)) {
  test(`${c.area}: ${c.id}`, () => {
    assert.ok(c.ok, c.message);
  });
}
