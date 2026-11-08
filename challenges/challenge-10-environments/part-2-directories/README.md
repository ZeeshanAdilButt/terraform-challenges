# Challenge 10, part 2: one directory per environment, and a guard on prod

**Time:** about 45 minutes. **Download:** none (`alpine:3.23` is on your machine; the Docker provider comes from the plugin cache). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Part 1 ended with a lesson you can feel: with workspaces, the only thing between you and prod is the name of a selected workspace that you cannot see in the file you are editing. Teams that have been burned once usually move each environment into its own folder. Then somebody asks the next question: "Fine, but what stops a `terraform destroy` in the prod folder?"

This part builds the folders, moves the state onto a server that locks it, and then tries to destroy prod.

## The idea

**Directories instead of workspaces.** `envs/dev` and `envs/prod` each hold a complete configuration. Each has its own state. What you are about to change is written in the files in front of you (the container is called `tfc-c10-p2-prod-app`), and in the folder you stand in.

**A remote state with a lock.** The `http` backend keeps the state on a server that you point it at. The server also holds a **lock**: while one run changes the state, a second run is told to wait. A lock needs its own address, `lock_address`. Without it, the `http` backend does not lock at all. `run.mjs` starts the teaching server `toolkit/state-server.mjs` for you and writes a `backend.hcl` for each folder.

**A guard in the code.** `lifecycle { prevent_destroy = true }` on a resource makes Terraform stop with an error whenever a plan would destroy it. It protects prod from `terraform destroy` and from a change that would replace the resource. It has a limit that this part shows you: it is part of the code, so removing it (or removing the resource) removes the guard.

## Your task

`envs/prod/main.tf` has one fault: nothing stops a destroy. Add a `lifecycle` block to the `docker_container` with `prevent_destroy = true`. Leave `envs/dev` alone: dev is meant to be thrown away.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-10-environments/part-2-directories/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | Edit `envs/prod/main.tf` | Add the guard. |
| 3 | `node challenges/challenge-10-environments/part-2-directories/run.mjs` | About 4 minutes. Starts the state server on port 8820, builds both environments, changes dev, destroys dev, tries to destroy prod, shows what removing the guard does, then cleans up. |
| 4 | `node --test challenges/challenge-10-environments/part-2-directories/test.mjs` | Passes when prod is protected. |
| 5 | `node toolkit/show-facts.mjs c10.p2` | Shows the saved numbers. |

Add `--reference` to step 3 to run the solution. Add `--record` to write `results.md`. If port 8820 is busy, stop whatever uses it first. Do not kill programs by name.

## What you should see

The recorded run is in [results.md](results.md). In short:

- The server holds `dev/app.json` and `prod/app.json`. There is no `terraform.tfstate` in either folder.
- A change in `envs/dev` moves the dev state from serial 1 to serial 2. The prod state stays at serial 1, and a plan in `envs/prod` says `No changes.`
- `terraform destroy` in `envs/dev` works.
- `terraform destroy` in `envs/prod` stops with `Error: Instance cannot be destroyed` and the text `has lifecycle.prevent_destroy set`. Both prod resources stay.
- Delete the `lifecycle` block, and `terraform plan -destroy` says `Plan: 0 to add, 0 to change, 2 to destroy.` with no complaint.
- Delete the whole `docker_container` block, and `terraform plan` says `# docker_container.app will be destroyed` and `(because docker_container.app is not in configuration)`. The guard went with the resource.
- The server log of one apply shows the order: a lock, a read of the state, a write, an unlock.

With the starter, `terraform destroy` in `envs/prod` succeeds. That is the fault.

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c10.p2.state_files_count` | Files of the form `<env>/app.json` in the state server folder. |
| `c10.p2.dev_serial_before_change`, `c10.p2.dev_serial_after_change`, `c10.p2.prod_serial_unchanged` | The `serial` field inside each state file on the server, before and after the dev apply. |
| `c10.p2.lock_requests_count`, `c10.p2.unlock_requests_count` | `LOCK` and `UNLOCK` requests the server saw during the whole part. |
| `c10.p2.destroy_prod_blocked`, `c10.p2.destroy_prod_error_text` | `terraform destroy` in `envs/prod` exits with an error that names `prevent_destroy`. |
| `c10.p2.no_guard_destroy_count`, `c10.p2.resource_removed_destroy_count` | The destroy count on the `Plan:` line after removing the block, or the whole resource. |

## Platform box

- **Linux and WSL2:** Terraform in a container reaches the server on your machine through `host.docker.internal`, which the toolkit maps to the host. With a local Terraform binary, `run.mjs` uses `127.0.0.1`.
- **Docker Desktop:** the same output. The server binds to all interfaces of your machine on port 8820 while the part runs, and stops when it ends.
- **Codespace:** the same output.
- **Local binary or container:** a Terraform 1.17 or newer binary on your PATH gives the same output.

[SAFETY.md](../../../SAFETY.md)
