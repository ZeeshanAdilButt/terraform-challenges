// Step 2 of the pipeline: the gate. It reads the plan as JSON and fails the pipeline when the plan destroys anything.
// Run: node ci/gate.mjs <plan.json>
// Exit code 0: the plan destroys nothing. Exit code 1: it destroys something (the lines say what).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The resources a plan would destroy, as a list of { address, action }.
 * `plan` is the object from `terraform show -json <planfile>`.
 * Each item of plan.resource_changes has an address and change.actions:
 *   ["create"]            nothing is destroyed
 *   ["delete"]            destroyed
 *   ["delete", "create"]  replaced: destroyed, then built again
 *   ["create", "delete"]  replaced, the other way round (create_before_destroy)
 */
export function findDestroys(plan) {
  // TODO: return one { address, action } for every change whose actions include "delete".
  // Use action "replace" when the actions also include "create", otherwise "delete".
  return [];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node ci/gate.mjs <plan.json>');
    process.exit(2);
  }
  const destroys = findDestroys(JSON.parse(readFileSync(file, 'utf8')));
  if (destroys.length === 0) {
    console.log('gate: the plan destroys nothing. Passed.');
  } else {
    console.log(`gate: the plan destroys ${destroys.length} resource${destroys.length === 1 ? '' : 's'}. Blocked.`);
    for (const d of destroys) console.log(`  ${d.action}: ${d.address}`);
    process.exit(1);
  }
}
