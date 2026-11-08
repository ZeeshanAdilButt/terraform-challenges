# Notes: challenge 6, plans and drift

Built against Terraform 1.17.1 (image `hashicorp/terraform:1.17.1`, `TFC_MODE=docker`). Providers: `kreuzwerker/docker` 4.6.0, `hashicorp/local` 2.9.1, `hashicorp/random` 3.9.1, the built-in `terraform_data`. Docker objects: `tfc-c6-web`, `tfc-c6-worker` (part 1), `tfc-c6-app` (part 2), all labelled `tfc.challenge=6`. No state server is used here (the roadmap's local `http` backend belongs to challenge 5).

## What each part proves

- **Part 1, read the plan JSON.** The last line of a plan (`Plan: 4 to add, 1 to change, 4 to destroy.`) hides that three of the adds and three of the destroys are replacements. The JSON has an `actions` list per resource: `["delete","create"]` for a replacement, `["create","delete"]` for one with `create_before_destroy`. `replace_paths` names the attributes that forced it, `action_reason` says why Terraform acts. The learner fixes `classify.mjs`; the starter reports every replacement as a plain `delete`. Tests use `fixtures/changes.json` and need no Docker.
- **Part 2, drift and refresh-only.** `docker rename` makes the plan want to destroy and rebuild the container. `plan -refresh-only` reports the drift and plans nothing; `apply -refresh-only` writes it into the state but the next plan still wants the replacement. Exit codes 0, 1 and 2. `-minimal-refresh` misses a stop it was not asked to look at. The learner fixes `drift.mjs` (`verdict`, `driftedAddresses`). Tests use `fixtures/drift-plan.json`.
- **Part 3, sensitive values in plans.** Predict nine places, then see which hold the secret. The starter's predictions are all `false`.

## What differs from the hints or the dossier (all checked by running)

1. **The sensitive variable is in the plan JSON in plain text:** `variables.db_password.value`, and `after.input` of the resource that uses it, with `after_sensitive.input: true` next to it. The random password is not in the plan (`after_unknown`), and is in the state after the apply.
2. **The saved plan file holds the secret.** The raw bytes of `plan.tfplan` do not contain it (it is a zip, deflated), but the entry `tfplan` inside does. `lib.mjs` reads the zip with Node's `zlib`.
3. **`terraform show` prints `terraform_data.output` in clear** (a copy of the secret input) even though `input` shows `(sensitive value)`. A surprise of this run. It is true for `terraform_data` in 1.17.1 with the setup in `main.tf`; do not generalise it to all providers.
4. **`-minimal-refresh` is blind to drift in a resource that has no planned change.** After `docker stop`, `plan -minimal-refresh -detailed-exitcode` printed `No changes.` and exit code 0, with no `Refreshing state` line; the plain plan refreshed and exited 2. The dossier says it refreshes "only resource instances that Terraform plans to change"; this shows what that means for a drift check. A resource that already had a planned change would be refreshed: in a first version of this part the stop came after `apply -refresh-only` and the rename, and `-minimal-refresh` did refresh the container and saw the stop (1 `Refreshing state` line, exit code 2), so the state was no longer clean by then. The part therefore runs this comparison first, from a clean state.
5. **A stopped container is an in-place update** (`must_run` false to true), not a replacement; **a renamed container is a replacement** (`name` forces replacement). `apply -refresh-only` after the rename wrote the new name into the state and the plan still said `Plan: 1 to add, 0 to change, 1 to destroy.`
6. **A refresh-only plan has no `resource_changes` (zero entries) and a `resource_drift` list.** Starter `driftedAddresses` reads the wrong key.
7. **The refresh-only text report is noisy:** the provider adds empty lists (`+ dns = []` and others) next to the real change. The README says to read the `name` line.
8. `terraform plan -detailed-exitcode` with a missing `-var-file` exits 1 (`Error: Failed to read variables file`). That is the error example; no deliberate typo in the code was needed.
9. **The `-replace` plan** gives `["delete","create"]` with `action_reason` `replace_by_request`.
10. `terraform_data` removed from the code gives `delete_because_no_resource_config`; attribute-forced replacements give `replace_because_cannot_update`.

## Problems hit while building

- **Shared plugin cache races** with other builders, in every part that installs a provider (`Failed to install provider`, `text file busy`, `Required plugins are not installed`). `lib.mjs` retries (`initRetry`, `tfRetry`).
- **`facts.json` loses writes when several builders run at once.** Runs wrote through `TFC_FACTS_PATH` to private files that were merged at the end.
- The test of parts 1 and 2 imports a fixture at load time, so the reference run with `--record` must come first; it writes the fixture.

## Lines to quote

Part 1 (`results.md`):

```text
Plan: 4 to add, 1 to change, 4 to destroy.
```

```text
docker_container.web       ["delete","create"]  replace_because_cannot_update
docker_container.worker    ["update"]
local_file.motd            ["delete","create"]  replace_because_cannot_update
terraform_data.cbd         ["create","delete"]  replace_because_cannot_update
terraform_data.newcomer    ["create"]
terraform_data.old         ["delete"]           delete_because_no_resource_config
terraform_data.same        ["no-op"]
```

```text
  # docker_container.web must be replaced
      ~ image                                       = "nginx:1.27-alpine" -> "alpine:3.23" # forces replacement
  # terraform_data.old will be destroyed
  # (because terraform_data.old is not in configuration)
```

Part 2:

```text
Error: Failed to read variables file
Given variables file nope.tfvars does not exist.
```

```text
      ~ name                                        = "tfc-c6-app-moved" -> "tfc-c6-app" # forces replacement
Plan: 1 to add, 0 to change, 1 to destroy.
```

```text
Note: Objects have changed outside of Terraform
  # docker_container.app has changed
```

```text
This is a refresh-only plan, so Terraform will not take any actions to undo
these. If you were expecting these changes then you can apply this plan to
record the updated values in the Terraform state without changing any remote
objects.
```

`plan -minimal-refresh` after `docker stop`: `No changes. Your infrastructure matches the configuration.`, exit code 0. Plain plan: `# docker_container.app will be updated in-place`, exit code 2.

Part 3: `(sensitive value)` in the plan text; `variables.db_password.value`, `change.after.input` and `change.after_sensitive.input` in the plan JSON; `api_token = <sensitive>` from `terraform output`; `terraform output -json` prints the value with `sensitive: true`.
