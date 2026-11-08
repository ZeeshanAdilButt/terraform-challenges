# Challenge 3, part 2: for_each keys

**Time:** about 70 minutes. **Download:** the `local` and `random` providers (a few MB), once. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Part 1 ended with a one-line change that destroyed three files. The fix everyone reaches for is `for_each`. A teammate switches the file resources to `for_each`, pushes, and the pipeline fails: `The "for_each" argument must be a map, or set of strings`. They fix that. A week later someone builds the keys of a `for_each` from the names of freshly created resources, and the plan fails again: `Invalid for_each argument ... known only after apply`.

Both errors say the same thing: **`for_each` needs keys, and the keys must be known before anything is created.** This part gives you the working shape, shows what it saves you, and shows you both errors.

## The idea

`for_each` makes one resource instance per **key**. The address uses the key, not a position:

```hcl
resource "local_file" "item" {
  for_each = toset(var.names)
  filename = "out/${each.key}.txt"
  content  = "hello ${each.value}\n"
}
```

gives `local_file.item["alpha"]`, `local_file.item["bravo"]`, and so on. Remove `"charlie"` from the list and the only address that disappears is `local_file.item["charlie"]`. The others keep their address and their content, so they are not touched. Compare part 1, where the address was a position.

Words you need:

| Word | Meaning |
|---|---|
| set | A collection with no order and no duplicates. `toset(["a", "b"])` makes one from a list. `for_each` accepts a set of strings. |
| map | A collection of `key = value` pairs. `for_each` accepts a map; each key becomes an address. |
| object | A value with named fields, such as `{ port = 80, greeting = "hello" }`. A map of objects (`map(object({...}))`) is the usual shape for "one resource per site, each with its own settings". |
| `each.key`, `each.value` | Inside the block: the key of the current instance, and its value. For a set of strings they are the same string. |

Two rules for the keys:

1. They must be **known at plan time**. A name you wrote in the configuration is known. The `id` of a resource that does not exist yet is not.
2. They should be **stable names**, not positions or random values. A key is an address; changing it means destroying and recreating.

When you have values that are only known after apply, put them in the map **values** and write the **keys** yourself.

## What you do

Two things are broken in the starter. `main.tf` passes a plain list to `for_each`. `unknown-keys/main.tf` builds its keys from random pet names. Fix both. `sites.tf` is a working map of objects: you do not edit it.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-3-the-index-shift/part-2-for-each-keys/test.mjs` | Fails on purpose: no facts yet. |
| 2 | `node challenges/challenge-3-the-index-shift/part-2-for-each-keys/run.mjs` | The plan fails with the list error. Read it. About 20 seconds. |
| 3 | Edit `challenges/challenge-3-the-index-shift/part-2-for-each-keys/main.tf` | Turn the list into a set. |
| 4 | `node challenges/challenge-3-the-index-shift/part-2-for-each-keys/run.mjs` | Applies, plans the five edits from part 1 and three edits to the map, then shows the unknown-keys error, then plans your `unknown-keys/` folder, which still fails. About 3 minutes. |
| 5 | Edit `challenges/challenge-3-the-index-shift/part-2-for-each-keys/unknown-keys/main.tf` | Write the keys yourself and keep the pet names as values. |
| 6 | `node challenges/challenge-3-the-index-shift/part-2-for-each-keys/run.mjs` | Run again. |
| 7 | `node --test challenges/challenge-3-the-index-shift/part-2-for-each-keys/test.mjs` | Repeat steps 5 to 7 until it passes. |
| 8 | `node toolkit/show-facts.mjs c3.p2` | Shows the saved facts. |

`run.mjs` copies your files to a `work/` folder and runs Terraform there. Files made by the resources are in `work/out/`, `work/sites/` and `work/unknown-keys/`.

## What you should see

In the recorded reference run:

| Edit | Plan line (for_each) | With count (part 1) |
|---|---|---|
| remove the first name | `Plan: 0 to add, 0 to change, 1 to destroy.` | 4 add, 5 destroy |
| remove the middle name | `Plan: 0 to add, 0 to change, 1 to destroy.` | 2 add, 3 destroy |
| remove the last name | `Plan: 0 to add, 0 to change, 1 to destroy.` | 0 add, 1 destroy |
| reverse the order | `No changes.` | 4 add, 4 destroy |
| insert a name at the front | `Plan: 1 to add, 0 to change, 0 to destroy.` | 6 add, 5 destroy |

For the map of objects: changing one site's port replaces that one file (1 add, 1 destroy), removing a key destroys one, adding a key adds one. And the two errors, in the words Terraform uses:

- a list: `The "for_each" argument must be a map, or set of strings, and you have provided a value of type ...`
- unknown keys: `Invalid for_each argument` and `The "for_each" set includes values derived from resource attributes that cannot be determined until apply`.

The full recorded run is in [results.md](results.md). The chart compares the destroys of count and for_each (the count bars are read from part 1's saved facts).

![Resources destroyed: count versus for_each](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c3.p2.baseline_plan_ok`, `c3.p2.baseline_added_count` | Your `main.tf` plans; the baseline apply made 8 resources (5 items and 3 sites). |
| `c3.p2.<edit>_plan_ok`, `_add_count`, `_change_count`, `_destroy_count` | The plan for `remove_first`, `remove_middle`, `remove_last`, `reverse` or `insert_front`. `No changes` counts as 0, 0, 0. |
| `c3.p2.reverse_no_changes` | The plan for the reversed list said `No changes`. |
| `c3.p2.middle_apply_added_count`, `middle_apply_destroyed_count`, `files_after_middle_apply_count` | The real removal of `charlie`: 0 added, 1 destroyed, 4 files left. |
| `c3.p2.site_edit_*`, `site_remove_*`, `site_add_*` | The plans for editing, removing and adding a site in the map. |
| `c3.p2.unknown_keys_error_shown` | The demo plan failed with `Invalid for_each argument`. |
| `c3.p2.unknown_keys_fixed_plan_ok`, `unknown_keys_fixed_add_count` | Your `unknown-keys/main.tf` plans, with 4 to add (two pets, two files). |

## Platform box

| Where you run | What to know |
|---|---|
| Linux and WSL2 | As written. |
| Docker Desktop | As written. Each `terraform` call starts a container, so the run takes a few minutes. |
| GitHub Codespace | As written. |
| Local Terraform, not the container | Same plans and errors. |

## Stuck?

- `main.tf` still fails: `for_each = toset(var.names)`.
- `unknown-keys` still fails with `Invalid for_each argument`: the keys must not mention a resource attribute. Write them as plain words, such as `first` and `second`, and put `random_pet.app[0].id` on the right-hand side of the `=`.
- Files left in `work/` after you stop: delete the `work/` folder.
