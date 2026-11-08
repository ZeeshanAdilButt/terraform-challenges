# Challenge 10, part 1: workspaces on local state

**Time:** about 40 minutes. **Download:** none (the image `alpine:3.23` is already on your machine from earlier challenges; the Docker provider comes from the plugin cache after the first `init`). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Monday, 9 am. You have a change for the dev environment. You open the terminal where you worked on Friday, type `terraform apply -var greeting=hello-dev`, and press Enter. The plan said "1 to destroy". You did not read it, because dev changes are always small.

The terminal was in the prod workspace.

This part makes that mistake on purpose, in a safe place, so you can see exactly what Terraform shows you and what it does not.

## The idea

A **state** file is Terraform's notebook: which real objects it built, and their settings. One folder of Terraform code normally has one state. A **workspace** is a named, separate state for the same code. Same files, several notebooks.

- Every folder starts with one workspace called `default`.
- `terraform workspace new dev` creates a workspace and **selects it**. Every later command in that folder uses the selected one, until you select another.
- `terraform.workspace` is a built-in value inside your code. It is the name of the selected workspace, so you can use it in names: `tfc-c10-p1-${terraform.workspace}-app`.
- With **local** state, the state files sit in `terraform.tfstate.d/<workspace>/terraform.tfstate` next to your code. They are on one machine, with no lock shared between people, and every workspace is reachable with the same permissions.

Workspaces are quick, and they are easy to get wrong, because the only thing that tells you where you are is the name of the selected workspace, and nothing in the file you are editing shows it.

## Your task

`main.tf` builds one image resource and one container. It has two faults.

1. **The container name does not mention the workspace.** Docker allows each container name once. A second workspace cannot build its own container. Fix the name so each workspace gets its own.
2. **Any workspace is accepted, including `default`.** Add a guard: a `precondition` (inside a `lifecycle` block of the container) that allows only the workspaces `dev` and `prod`, with a message that tells the reader what to run.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-10-environments/part-1-workspaces/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | Edit `main.tf` | Fix the two faults. |
| 3 | `node challenges/challenge-10-environments/part-1-workspaces/run.mjs` | About 3 minutes. Creates the workspaces, makes the mistake, tries `default`, tries to delete a busy workspace, then destroys everything it made. |
| 4 | `node --test challenges/challenge-10-environments/part-1-workspaces/test.mjs` | Passes when both faults are fixed. |
| 5 | `node toolkit/show-facts.mjs c10.p1` | Shows the saved numbers. |

To see the solution run, add `--reference` to step 3. To write `results.md` yourself, add `--record`.

## What you should see

The recorded run is in [results.md](results.md). In short:

- `terraform workspace list` shows `* default`, then `dev`, then `prod`. The star marks the selected one.
- Two state files appear: `terraform.tfstate.d/dev/terraform.tfstate` and `terraform.tfstate.d/prod/terraform.tfstate`.
- Two containers exist: `tfc-c10-p1-dev-app` and `tfc-c10-p1-prod-app`.
- The wrong-workspace plan says `Plan: 1 to add, 0 to change, 1 to destroy.` and the `env` line carries `# forces replacement`. After the apply, the prod container has the new greeting and the dev container still has the old one. Nothing asked "are you sure this is prod?"
- In the `default` workspace the plan stops with `Error: Resource precondition failed`.
- `terraform workspace delete dev` stops with `Error: Workspace is not empty` while the workspace still tracks the container and the image.

If you run the starter as it is, the apply in the prod workspace fails, because both workspaces want the container name `tfc-c10-p1-app`, and the rest of the run shows what is missing.

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c10.p1.workspaces_count` | Lines printed by `terraform workspace list` after `dev` and `prod` exist. |
| `c10.p1.state_files_count` | Files named `terraform.tfstate` under `terraform.tfstate.d/`. |
| `c10.p1.containers_count` | Containers with the label `tfc.challenge=10` after the two applies (`docker ps -a`). |
| `c10.p1.wrong_env_destroy_count` | The destroy count on the `Plan:` line of the plan made in the prod workspace. |
| `c10.p1.prod_changed`, `c10.p1.dev_unchanged` | `docker inspect` on each container after the wrong apply: the `GREETING` variable. |
| `c10.p1.default_blocked` | The plan in `default` exits with an error that says `precondition failed`. |
| `c10.p1.delete_nonempty_blocked` | `terraform workspace delete dev` exits with an error that says `is not empty`. |

## Platform box

- **Linux and WSL2:** the same output. In docker mode the toolkit runs the container as your user and adds your Docker group.
- **Docker Desktop (Windows, macOS):** the same output. Terraform runs inside `hashicorp/terraform:1.17.1` and reaches Docker through the mounted socket.
- **Codespace:** Docker works the same way. The first `init` downloads the Docker provider.
- **Local binary or container:** a Terraform 1.17 or newer binary on your PATH gives the same output. `run.mjs` removes colour codes from every command, because the workspace commands ignore the no-colour setting.

[SAFETY.md](../../../SAFETY.md)
