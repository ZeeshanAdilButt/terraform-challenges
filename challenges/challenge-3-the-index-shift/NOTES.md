# Notes on challenge 3: the index shift

## What each part proves

- **Part 1** (count and the shift): with `count`, the address is the position in the list. Removing the middle of five names makes `Plan: 2 to add, 0 to change, 3 to destroy.`; removing the first makes `4 to add, 0 to change, 5 to destroy`; removing the last makes `0 to add, 0 to change, 1 to destroy`. Reversing the list replaces four of five; inserting at the front replaces all five and adds one. The learner predicts the first three before the run; the middle removal is then applied for real (3 destroyed, 2 added, 4 files left). The starter has one planted fault, `count = 5` written by hand, which fails as soon as the list has four names.
- **Part 2** (for_each keys): with `for_each` over a set or a map, the key is the address. The same five edits cost 1, 1, 1 destroys, nothing for a reversal and one add for an insert. A map of objects changes one resource when one value changes. The starter has two planted faults: a list passed to `for_each`, and keys built from the names of resources that do not exist yet (`unknown-keys/`).

## Problems hit and what differs per platform

- `filename = item-<index>.txt`, not `<name>.txt`, on purpose in part 1. With the name in the filename, two shifted resources would each delete and create the other's file in parallel (`item[2]` creates `delta.txt` while `item[3]` destroys `delta.txt`), an unrelated race that would hide the lesson. With an index-based filename each replacement is independent.
- With `count = 5` and a four-name list, every plan fails with `Invalid index`; the message points at `var.names[count.index]` with `count.index is 4` and `var.names is list of string with 4 elements`. `run.mjs` prints it and the part continues (the facts say the plan failed).
- A plan with `for_each` over a list fails before the plan is shown. The unknown-keys error is raised after Terraform has printed `Plan: 2 to add` for the two pets: `Terraform planned the following actions, but then encountered a problem`. The recorded step shows the Plan line and then the error.
- `terraform plan` prints no `Plan:` line when nothing changes. `run.mjs` treats `No changes.` as 0, 0, 0.
- The chart of part 2 reads count destroys from part 1's saved facts (`c3.p1.*_destroy_count`); record part 1 first.
- Everything here is local files: no Docker objects, so the label rule has nothing to attach to. Part folders ship their own `.terraform.lock.hcl` (local 2.9.1; random 3.9.1 where used) so `init` does not rewrite the shared plugin cache. `unknown-keys/` runs its own `init` without a lock file (random, a few MB).
- Free disk on C: fell to 1.2 GB during the build, from other work on the machine (Docker volumes and build cache). Nothing in challenge 3 writes more than a few kilobytes.

## Lines to quote

Part 1, the plans (from five names):

```text
Plan: 4 to add, 0 to change, 5 to destroy.    remove the first
Plan: 2 to add, 0 to change, 3 to destroy.    remove the middle
Plan: 0 to add, 0 to change, 1 to destroy.    remove the last
Plan: 4 to add, 0 to change, 4 to destroy.    reverse the order
Plan: 6 to add, 0 to change, 5 to destroy.    insert at the front
```

```text
  # local_file.item[2] must be replaced
  # local_file.item[3] must be replaced
  # local_file.item[4] will be destroyed
```

The starter's error:

```text
Error: Invalid index
    │ count.index is 4
    │ var.names is list of string with 4 elements
The given key does not identify an element in this collection value: the
```

Part 2:

```text
Error: Invalid for_each argument
    │ var.names is a list of string
The given "for_each" argument value is unsuitable: the "for_each" argument
must be a map, or set of strings, and you have provided a value of type list
of string.
```

```text
Error: Invalid for_each argument
    │ random_pet.app is tuple with 2 elements
The "for_each" set includes values derived from resource attributes that
cannot be determined until apply, and so Terraform cannot determine the full
set of keys that will identify the instances of this resource.
When working with unknown values in for_each, it's better to use a map value
where the keys are defined statically in your configuration and where only
the values contain apply-time results.
```

for_each plans: `Plan: 0 to add, 0 to change, 1 to destroy.` for remove first, middle and last; `No changes.` for a reversal; `Plan: 1 to add, 0 to change, 0 to destroy.` for an insert; addresses look like `local_file.item["charlie"]` and `local_file.site["api"]`.

## Deviations from the roadmap and the dossier

- The roadmap says part 1 "removing the middle list item destroys and recreates later items". Confirmed, and the exact counts are above. The hint predicted a destroy-and-add pair per shifted item; that holds (replacement = one add and one destroy), plus one extra destroy for the last position.
- Part 2 also covers `toset`, a map of objects and the unknown-keys error, as the hint asked. The unknown-keys error appears in `terraform plan`, not only in `apply`.
- No documentation claim in the dossier about challenge 3 was found wrong.
