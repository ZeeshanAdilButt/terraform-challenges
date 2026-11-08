# Challenge 5, part 3: lost state and restore

**Time:** about 45 minutes. **Download:** the `kreuzwerker/docker` provider (about 75 MB, first run only) and nothing else. The container uses `alpine:3.23`, which you pulled in challenge 0. **Docker:** one labelled container, `tfc-c5-app`. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Someone deletes `terraform.tfstate`. Maybe a clean-up script in the wrong folder, maybe a laptop that was reinstalled. The container it described is still running. You run `terraform plan` and it says it will create the container. You run `terraform apply` and Docker answers with an error about a name.

The real-world version of this has no name conflict: it creates a *second* database, or deletes the first one. A name that conflicts is the lucky case. This part makes you lose the state on purpose and get it back two ways.

## The idea

The state is Terraform's only record of which real thing belongs to which resource block. Lose it and Terraform thinks nothing exists. The real world is not told: your container keeps running.

Two ways back:

- **A. Restore the backup.** Every command that writes the state first copies the old file over `terraform.tfstate.backup`. If the backup survives, copy it back. It is as old as the apply before the last one, so the plan after a restore shows what the last apply did.
- **B. Import.** `terraform import ADDRESS ID` writes one existing real thing into the state. It checks nothing and it does not read your code. Always plan right after. The Docker provider cannot read some arguments (in the recorded run the environment and the labels; the image name too when the container was made from an image id) back from a running container, so a plan right after the import wants to **replace** the container. The cure is a `lifecycle` block that says which arguments to ignore. Without it, an apply here destroys what you just adopted.

The backup is a single file, and one more write replaces it. Copy it aside the moment you notice the loss.

## The files

| File | What it is |
|---|---|
| `before/main.tf` | Day 1: just the container. Do not edit. |
| `main.tf` | Day 2: the container plus `terraform_data.release`. **The fault is here**: read the `FIX` comment. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-5-state/part-3-lost-state-and-restore/test.mjs` | Fails on purpose. |
| 2 | `node challenges/challenge-5-state/part-3-lost-state-and-restore/run.mjs` | Builds, loses the state, tries a plain apply, restores the backup, then loses everything and imports. About 3 minutes. Read the plan after the import. |
| 3 | Edit `main.tf` | Add the `lifecycle` block named in the `FIX` comment. |
| 4 | Run step 2 again, then `node --test .../test.mjs` | Passes when the import no longer wants to destroy the container. |
| 5 | `node toolkit/show-facts.mjs c5.p3` | Shows the saved numbers. |

With the starter files, `run.mjs` stops before it applies the plan after the import, because that plan destroys the container. It never applies a destroy it did not expect. Add `--reference` to `run.mjs`, or set `TFC_REFERENCE=1`, to run the solution.

## What you should see

1. Two applies (container, then release record). The folder holds `terraform.tfstate` (container and release, serial 3) and `terraform.tfstate.backup` (container only, serial 1).
2. After the state file is deleted: `terraform state list` says `No state file was found!`. `docker ps` still shows `tfc-c5-app`.
3. `terraform plan`: `Plan: 2 to add, 0 to change, 0 to destroy.`
4. `terraform apply` fails:

```text
Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c5-app" is already in use by container "<id>". You have to remove (or rename) that container to be able to reuse that name.
```

5. A colleague applies something small. The backup now holds only the release record: the container is gone from the one backup. That is why the run copied it aside first.
6. Recovery A: copy the saved backup to `terraform.tfstate`. The plan wants only the release record (`1 to add`). Apply it. `No changes.` The container id never changed.
7. Recovery B: delete every state file, then `terraform import docker_container.app <id>`. Plan. With the starter, the plan has `1 to destroy` and lines that end in `# forces replacement`. With the fix, `1 to add, 1 to change, 0 to destroy`. Apply, then `No changes.` and the same container id.

The full recorded run is in [results.md](results.md).

![Resources the plan wants to add](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c5.p3.state_resources_before_count`, `c5.p3.backup_resources_before_count` | Resources inside `terraform.tfstate` and `terraform.tfstate.backup` after day 2. |
| `c5.p3.state_list_after_loss_count`, `c5.p3.container_survives_loss` | Lines of `terraform state list` after the delete, and whether `docker ps` still shows the container. |
| `c5.p3.plan_lost_add_count`, `c5.p3.plan_lost_destroy_count` | The `Plan:` line with no state. |
| `c5.p3.apply_lost_exit_code`, `c5.p3.apply_conflict_error` | The apply with no state: exit code and the Docker sentence (the container id replaced by `<id>`). |
| `c5.p3.backup_has_container_after_first_failed_apply`, `c5.p3.backup_has_container_after_replace_apply` | Whether `terraform.tfstate.backup` still holds `docker_container.app` after the failed apply, and after the apply with `-replace`. |
| `c5.p3.restore_plan_add_count`, `c5.p3.restore_plan_destroy_count`, `c5.p3.restore_final_no_changes`, `c5.p3.restore_container_id_unchanged` | Recovery A: the plan after the restore, whether the final plan says No changes, and whether `docker inspect` gives the same container id as before. |
| `c5.p3.import_exit_code`, `c5.p3.import_plan_add_count`, `c5.p3.import_plan_change_count`, `c5.p3.import_plan_destroy_count`, `c5.p3.import_plan_forces_replacement_count` | Recovery B: the import and the plan after it (`forces replacement` lines counted). |
| `c5.p3.import_final_no_changes`, `c5.p3.import_container_id_unchanged` | After the apply following the import. |
| `c5.p3.leftover_count` | Docker objects still labelled `tfc.challenge=5` after cleanup. Must be 0. |

## What is different on your machine

- **Linux and WSL2, Docker Desktop, Codespace:** the same lines. The toolkit mounts the Docker socket into the Terraform container (the one named exception in [SAFETY.md](../../../SAFETY.md)); with a local binary no mount is needed.
- Container ids and the order of some lines differ on every run.
- If the Docker provider is later fixed to read labels, image and env back on import, the plan after the import will be shorter, and `import_plan_forces_replacement_count` will be 0 even for the starter. The recorded run is what 4.6.0 did.

## Stuck?

- Leftover container from a stopped run: `node toolkit/cleanup.mjs 5`.
- `Failed to install provider` or similar: another run was writing the shared plugin cache. `run.mjs` retries by itself.
- Do not run two parts of this challenge at once: each one cleans up everything labelled `tfc.challenge=5` when it starts and ends.
