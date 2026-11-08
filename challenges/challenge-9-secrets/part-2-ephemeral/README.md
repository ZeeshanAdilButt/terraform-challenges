# Challenge 9, part 2: ephemeral resources and write-only attributes

**Time:** about 35 minutes. **Download:** the `random` and `local` providers from part 1, plus the `null`, `time` and Docker providers for one schema check (already cached if you did the earlier challenges). No Docker objects are created. Every secret here is random and never printed. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Part 1 showed the secret in state, in a saved plan and in `show -json`. Hiding it on screen was never going to help. The question a team asks next: can Terraform use a secret and **never write it down**?

Since Terraform 1.10 it can, for values that do not have to live in state. This part moves a generated password from a normal resource to an **ephemeral** one, proves it is gone from every file, and shows what Terraform does when you try to put an ephemeral value somewhere it would have to be saved.

## The idea

An **ephemeral resource** (`ephemeral "type" "name" { }`) is read anew in every phase of a run (plan, apply) and is never stored. Terraform keeps it in memory while it works and forgets it. The same idea exists for input variables (`ephemeral = true`) and for module outputs.

| | Normal resource | Ephemeral resource |
|---|---|---|
| Written to state | yes | never |
| Written to a saved plan | yes | never |
| Value | stays until the resource is replaced | read anew in every phase, so it can differ between plan and apply |
| Can be used by | anything | only things that do not save it: another ephemeral resource, or a write-only attribute |

A **write-only attribute** (Terraform 1.11 and later) is an argument of a normal resource that accepts an ephemeral value, passes it to the real system, and does not save it. Providers pair it with a version number you increase to ask for a new value. A database resource with a write-only password argument is the typical case.

The honest part: **none of the providers this course uses has a write-only attribute.** The run proves it by counting them in the provider schemas. So the consumer here is another ephemeral resource, `local_command`, which runs a command and hands it the password on its standard input. In this config the command writes the password to a file, `vault.out`. That file stands in for the secrets manager, database or API that really needs the password. It is outside state on purpose: it is the place the secret is supposed to go.

What to remember: an ephemeral value reaches the system that needs it without becoming part of Terraform's memory. The price is that Terraform cannot remember it, cannot show a diff for it, and runs anything that uses it on every plan too.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | Open `main.tf` | `random_password.db` is a normal resource. The `ephemeral "local_command"` resource reads it. |
| 2 | `node challenges/challenge-9-secrets/part-2-ephemeral/run.mjs` | Applies, then searches the generated password in state, in `terraform show -json` and in a saved plan, and counts how many times the command ran. On the starter the password is found. |
| 3 | `node --test challenges/challenge-9-secrets/part-2-ephemeral/test.mjs` | Fails on purpose. |
| 4 | Edit `main.tf` | Make the password ephemeral: change the resource type to an `ephemeral` block and fix the reference in `stdin`. Two small edits. |
| 5 | Run step 2 again | The password is in `vault.out` and nowhere else. Then two demos run on copies: an ephemeral value in a normal attribute, and a count of write-only attributes in the provider schemas. |
| 6 | `node --test challenges/challenge-9-secrets/part-2-ephemeral/test.mjs` | Passes. |
| 7 | `node toolkit/show-facts.mjs c9.p2` | Shows the saved facts. |

The solution is in `reference/main.tf`. `TFC_REFERENCE=1 node challenges/challenge-9-secrets/part-2-ephemeral/run.mjs` runs it.

## What you should see

On the starter the password is in `terraform.tfstate`, in `show -json` and in the saved plan. On the reference all three say `no` and `vault.out` still holds it:

```text
vault.out holds it (the consumer received it): YES
terraform.tfstate: no
terraform show -json: no
terraform show -json of a saved plan: no
```

Two things you may not expect, both in [results.md](results.md):

- The store command ran **once during plan and once during apply** (`times the store command has run: 1`, then `2`). Ephemeral resources are opened in every phase. A command with a side effect runs when you only wanted to look. (On the starter, whose input is a normal resource not yet created, it does not run at plan time: its input is unknown. It runs once, at apply.)
- Using an ephemeral value in a normal attribute is refused:

```text
Error: Invalid use of ephemeral value
Ephemeral values are not valid for "content", because it is not a write-only
attribute and must be persisted to state.
```

The schema check ends with `write-only attributes found: 0` and `ephemeral resources found: 3 (local_command, random_bytes, random_password)`.

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c9.p2.init_ok`, `c9.p2.apply_ok` | Exit codes of init and apply. |
| `c9.p2.command_runs_after_plan_count`, `c9.p2.command_runs_after_apply_count` | Lines in `runs.log`, which the command adds to each time Terraform runs it. |
| `c9.p2.vault_file_has_secret` | `vault.out` holds a password of at least 16 characters. |
| `c9.p2.secret_in_state`, `c9.p2.secret_in_show_json`, `c9.p2.secret_in_plan_file` | True when the password read from `vault.out` is found in `terraform.tfstate`, in `terraform show -json`, in the JSON of a second saved plan. |
| `c9.p2.demo_ephemeral_into_resource_error` | First error line of the plan that puts an ephemeral value in a `local_file`. |
| `c9.p2.write_only_attribute_count` | Attributes with `write_only` true in `terraform providers schema -json` for random, local, null, time, docker and the built-in terraform provider. |
| `c9.p2.ephemeral_resource_count`, `c9.p2.providers_scanned_count` | Ephemeral resource types found, and providers scanned. |

## What is different on your platform

- **Linux and WSL2, Docker Desktop, Codespace:** the same. The command is run by `sh` **inside the Terraform container** in docker mode, so it works on every host.
- **Local binary:** `local_command` runs on your own machine and needs `sh` and `cat` on the PATH. On native Windows without them, use docker mode (`TFC_MODE=docker`).
- **Terraform version:** ephemeral resources need 1.10, write-only attributes 1.11. `ephemeral "local_command"` exists in the `local` provider 2.9.1, the version the lock file pins.

## Stuck?

- `Error: Invalid use of ephemeral value` in your own `main.tf`: an ephemeral value can only be read from another ephemeral block or a write-only attribute (the error message says so). Here: `stdin` of the other ephemeral resource.
- `A reference to a resource type must be followed by at least one attribute access`: you wrote `random_password.db.result` for an ephemeral resource. It is `ephemeral.random_password.db.result`.
- The password is still in state: you changed the type but a `resource` block with the same name remains somewhere, or the old state is in `work/`. Run step 2 again: it builds a fresh `work/` folder.
- The test still fails after you fixed `main.tf`: run step 2 first. The test reads the numbers of the last run.
