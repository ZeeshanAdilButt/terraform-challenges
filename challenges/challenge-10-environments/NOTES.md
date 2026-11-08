# Notes for challenge 10 (environments)

Module 9 of the course: Environments and blast radius. Headline interview question: how do you split state between dev and prod, and why? Follow-ups: workspaces or directories, and how do you limit who can touch prod state?

All outputs below come from real runs of Terraform 1.17.1 in docker mode (`TFC_MODE=docker`) on Docker Desktop, Engine 29.9.2.

## What each part proves

| Part | Folder | What the learner sees fail | What it proves |
|---|---|---|---|
| 1 | `part-1-workspaces` | Two workspaces build the same container name and the second apply fails. A change meant for dev, applied while prod is selected, rebuilds prod. A busy workspace cannot be deleted. | Workspaces split state, not safety. The only marker of the target environment is a selected name that is not in the file. A name that carries `terraform.workspace` and a precondition on the workspace name are the guard rails. |
| 2 | `part-2-directories` | `terraform destroy` in prod succeeds (starter), or is stopped by `prevent_destroy` (reference). Removing the block, or the resource, lifts the guard. | One folder and one state per environment: a dev change cannot move the prod serial. A lock needs `lock_address`. The guard is code, so review is the real control. |
| 3 | `part-3-least-privilege` | A committed password lets a developer and an unauthenticated laptop into prod. A CI job granted both environments reaches prod. | Least privilege by token: 401 from the state server stops Terraform at `init`, before any plan. The credential comes from the environment, never from Git. |

## Problems hit

- **Shared plugin cache.** Several builders work at once and `toolkit/tf.js` mounts one cache folder. Reproducibly on a busy machine a Terraform step fails once with `text file busy`, or with `the cached package for registry.terraform.io/kreuzwerker/docker 4.6.0 (in .terraform/providers) does not match any of the checksums recorded in the dependency lock file`, while another run installs the same provider. `lib/common.mjs` retries `init` (and any command that prints one of these messages) with a growing pause. A learner on their own machine does not meet this. No toolkit file was changed.
- **Workspace commands ignore `-no-color`.** `terraform workspace ...` prints colour codes even when `TF_CLI_ARGS_workspace` is not set (the toolkit's colour-off list does not include `workspace`). `lib/common.mjs` strips the codes. This is a gap in `toolkit/tf.js` (add `workspace` to `COLOR_OFF` to fix it); not changed here.
- **Lock files are committed.** Each part ships the `.terraform.lock.hcl` it needs, made with `terraform providers lock` for linux_amd64, linux_arm64, darwin_arm64 and windows_amd64 (plus the two h1 hashes the cached copy has produced). With one in place, `init` uses the shared plugin cache instead of rewriting it, which removes most of the flake above. Not tried on an arm64 machine.

## Deviations from the roadmap and the dossier

- **Dynamic `prevent_destroy` does not work in Terraform 1.17.1.** The dossier (`01g`, table of docs conflicts) lists "`prevent_destroy` can refer to input variables" as an OpenTofu 1.12 change. In Terraform 1.17.1, `lifecycle { prevent_destroy = var.protect }` fails at `terraform init` and `validate`:

  ```text
  Error: Variables not allowed
    on main.tf line 10, in resource "terraform_data" "x":
    10:     prevent_destroy = var.protect
  Variables may not be used here.
  Error: Unsuitable value type
  Unsuitable value: value must be known
  ```

  So the parts use a literal `prevent_destroy = true`. This is a Terraform versus OpenTofu difference for challenge 13 (not run with OpenTofu here: that image is not on this machine).
- **`prevent_destroy` and a deleted resource** (dossier, lifecycle row): confirmed. With the whole `docker_container` block deleted, the plan says `# docker_container.app will be destroyed` and `# (because docker_container.app is not in configuration)` and raises no error.
- **http backend locking** (not in the dossier): `lock_address` and `unlock_address` are needed. Without them an apply sends `GET`, `GET`, ..., `POST` and no `LOCK` at all. With them the sequence is `LOCK`, `GET`, `POST`, `UNLOCK`. Verified by a scratch run against the state server.
- **Teaching server tokens are all-or-nothing per environment** (one token per environment, read, lock and write alike). Real backends can give a plan job read-only access. The README of part 3 says so.
- **Part 3 `denial_text`**: the real message is `Error loading state: HTTP remote state endpoint requires auth`, printed by `terraform init`. The server's own `401` body is not shown by Terraform.

## What differs per platform

- Docker mode reaches the state server through `host.docker.internal`; local mode through `127.0.0.1`. `run.mjs` picks with `hostName()` from the toolkit. The recorded `backend.hcl` shows `<host>` in place of the name.
- Local binary: the same output, apart from the colour codes that the workspace commands print (removed by `run.mjs`).

## Lines to quote

Exact text, from `results.md` of each part.

Part 1:

- `Created and switched to workspace "dev"!`
- `Plan: 1 to add, 0 to change, 1 to destroy.` (the plan of a dev change made in the prod workspace; `~ env = [ # forces replacement`)
- `Error: Resource precondition failed` with `terraform.workspace is "default"` and `The workspace "default" is not allowed. Run: terraform workspace select dev (or prod).`
- `Error: Workspace is not empty` with `Workspace "dev" is currently tracking the following resource instances:`
- Starter only: `Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c10-p1-app" is already in use by container "<id>". You have to remove (or rename) that container to be able to reuse that name.`

Part 2:

- `Error: Instance cannot be destroyed` then `Resource docker_container.app has lifecycle.prevent_destroy set, but the plan calls for this resource to be destroyed. To avoid this error and continue with the plan, either disable lifecycle.prevent_destroy or reduce the scope of the plan using the -target option.`
- `Plan: 0 to add, 0 to change, 2 to destroy.` (after the lifecycle block is deleted)
- `# docker_container.app will be destroyed` and `# (because docker_container.app is not in configuration)`
- `dev state:  serial 2` next to `prod state: serial 1`, and `prod plan: No changes.`

Part 3:

- `Error: Error loading state: HTTP remote state endpoint requires auth`
- The server answered 401 four times, and the prod state serial stayed at 1.
