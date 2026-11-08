// Read a plan the way a reviewer must: from the JSON, not from the last line of the text.
//
// `terraform show -json plan.tfplan` lists every resource under "resource_changes". Each one has a
// "change" object with an "actions" list. The list for the same Terraform action can look different:
//
//   ["create"]             a new resource
//   ["update"]             changed in place
//   ["delete"]             removed
//   ["no-op"]              nothing to do
//   ["read"]               a data source is read
//   ["delete", "create"]   REPLACE: destroy the old one, then build the new one
//   ["create", "delete"]   REPLACE too, with create_before_destroy: build first, then remove the old one
//
// `change.replace_paths` lists which attributes forced a replacement, as lists of path steps,
// for example [["image"]].
//
// Run `node --test test.mjs` in this folder's parent to see what is wrong. Fix both functions.

/** One word for a change: 'create', 'update', 'replace', 'delete', 'read' or 'none'. */
export function classify(change) {
  const a = change.actions;
  // FIX 1: this version looks at one action at a time, so a replacement is reported as a plain
  // delete or a plain create. A replacement must be reported as 'replace', whatever the order.
  // The word 'read' is missing too: a data source that is read has the action "read".
  if (a.includes('delete')) return 'delete';
  if (a.includes('create')) return 'create';
  if (a.includes('update')) return 'update';
  return 'none';
}

/** The attributes that forced a replacement, as strings such as 'image' (an empty list when it is not a replacement). */
export function replaceReasons(change) {
  // FIX 2: read change.replace_paths (a list of lists of path steps) and join each path with '.'.
  return [];
}
