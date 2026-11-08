# Challenge 7 notes: a module

Built from real runs of Terraform 1.17.1 (image `hashicorp/terraform:1.17.1`, `TFC_MODE=docker`), `kreuzwerker/docker` 4.6.0, Docker Engine 29.9.2, Windows 11 with Docker Desktop. Git 2.54.0 inside the Terraform image.

## What each part proves

- **Part 1, build and call a module.** A module with five planted faults fails in a fixed order, and each failure teaches one rule: a provider block in a module blocks `for_each`; a module must declare `required_providers`; a name hard-coded in a module collides on the second copy (the plan cannot see it, Docker refuses it at apply); outputs are an interface (the leaky starter outputs the whole `docker_container`, with the env and the fake token, into `terraform output -json`); inputs need `validation`. The reference run also shows the first two faults on copies of the finished module.
- **Part 2, version it with Git tags.** The module lives in a local Git repository with tags `v1.0.0`, `v1.1.0` (backwards compatible) and `v2.0.0` (renamed input). The starter calls `?ref=main` (which is v2.0.0) with the old argument, so `init` fails. What `init` pins is the source string only. A version constraint on a Git source is refused. A moved tag is not noticed by a plain `init`, only by `init -upgrade`. A commit id cannot move.

## Where reality differed from the plan or the dossier

1. **`init` checks module arguments.** The orchestrator's hint and my first draft expected the breaking release (v2.0.0, renamed input) to fail at `plan`. It fails at `init`: `Error: Unsupported argument ... An argument named "memory_mb" is not expected here.` appears under "Initializing modules". Part 2 is built around that.
2. **A plain `init` after a moved tag keeps the old copy.** With the source string unchanged, `terraform init` prints `Initializing modules...` and `Terraform has been successfully initialized!` and the plan still passes. Only `init -upgrade` fetches the module again (and then fails). This is the real reason a tag is a weaker pin than a commit id.
3. **A changed ref without `init` is an error, not a silent use of the old copy.** `plan` says `Error: Module source has changed` and asks for `init`.
4. **`version` on a Git source.** Terraform reads the argument as a registry source: `Error: Invalid registry module source address`, `Failed to parse module registry address: a module registry source address must have either three or four slash-separated components.` and `Terraform assumed that you intended a module registry source address because you also set the argument "version", which applies only to registry modules.`
5. **Git inside the container.** `git` exists in `hashicorp/terraform:1.17.1` (2.54.0). A `git::file:///work/modrepo?ref=...` source works in docker mode because the module repository sits inside the mounted work folder. The demo caller therefore builds its own repository inside its own folder; a repository in the parent folder is invisible to the container.
6. **Provider quirk: `memory_swap`.** A container with `memory = 64` and no `memory_swap` makes every later plan show `memory_swap = 128 -> null` (Docker adds swap, the provider reads it back). Setting `memory_swap` to the same number as `memory` (no swap) removes the diff. The module sets both.
7. **Shared plugin cache races.** Other builders use the same `.cache/plugins`. Runs sometimes failed with `text file busy`, `Required plugins are not installed` or `the cached package ... does not match any of the checksums recorded in the dependency lock file`. `lib.mjs` retries init and the failed command (up to 3 times). A learner on their own machine will not see this.
8. **Lock file.** Each part folder carries the `.terraform.lock.hcl` the reference run produced (`kreuzwerker/docker` 4.6.0). It is the only generated file committed.

## Starter failures (the ladder of part 1)

1. `terraform init`: `Error: Module is incompatible with count, for_each, and depends_on` (provider block in the module).
2. `terraform init`: `Error: Failed to query available provider packages` ... `Did you intend to use kreuzwerker/docker?` (no `required_providers` in the module; after the provider block is removed).
3. `terraform apply`: `Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c7-app" is already in use by container "...". You have to remove (or rename) that container to be able to reuse that name.` (hard-coded name; the plan said `5 to add` without a warning).
4. After apply: `terraform output -json apps` holds a `container` object with `"env":["APP_ENV=dev","APP_TOKEN=fake-token-not-a-real-secret"]`.
5. `Plan: ...` for `TF_VAR_environments='{ qa = { memory_mb = 64 } }'` and for `memory_mb = 4096` (no validation).

## Lines to quote

Part 1 (from `part-1-build-and-call/results.md` and the starter run):

- `Error: Module is incompatible with count, for_each, and depends_on`
- `The module at module.app is a legacy module which contains its own local provider configurations, and so calls to it may not use the count, for_each, or depends_on arguments.`
- `Did you intend to use kreuzwerker/docker? If so, you must specify that source address in each module which requires that provider.`
- `Error: Invalid value for variable` with `environment must be one of: dev, staging, prod.`
- `Error: Invalid value for variable` with `memory_mb must be between 16 and 256.`
- `No changes. Your infrastructure matches the configuration.`
- `Apply complete! Resources: 5 added, 0 changed, 0 destroyed.` and `Destroy complete! Resources: 5 destroyed.`
- `Plan: 5 to add, 0 to change, 0 to destroy.`

Part 2 (from `part-2-version-with-git/results.md`):

- `Downloading git::file:///work/modrepo?ref=v1.1.0 for app...`
- `Error: Module source has changed` / `The source address was changed since this module was installed. Run "terraform init" to install all modules required by this configuration.`
- `Error: Unsupported argument` / `An argument named "memory_mb" is not expected here.`
- `Error: Invalid registry module source address` / `Failed to parse module registry address: a module registry source address must have either three or four slash-separated components.`
- The `modules.json` entry: `"Source": "git::file:///work/modrepo?ref=v1.1.0"`, `"Dir": ".terraform/modules/app"`.
- The moved tag: plain `init` then `No changes.`; `init -upgrade` then `Error: Unsupported argument`.

## Platform differences

- Local mode on Windows writes a `file:///C:/...` path for the repository; not run here (the reference run is docker mode).
- With a local Terraform 1.17 or newer the output is the same except for the `Installed kreuzwerker/docker` line (cached provider).
