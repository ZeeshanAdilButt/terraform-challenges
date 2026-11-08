# Challenge 5, part 1: state commands

**Time:** about 35 minutes. **Download:** the `hashicorp/local` provider (a few MB, first run only). **Docker:** not used in this part. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

You rename a resource in the code, from `notes` to `readme`. It is a tidy-up. The file does not change. You run `terraform plan` to be sure, and it says:

```text
Plan: 1 to add, 0 to change, 2 to destroy.
```

Two things to destroy, for a rename. The second one is a file another team still reads. You did not ask for that. What happened is that Terraform does not know a rename is a rename. This part shows you how to tell it, without touching the real world.

## The idea

The **state** is a file called `terraform.tfstate`. It is Terraform's memory: for every resource in your code, it remembers which real thing it made. Terraform compares three things: your code, the state, and (when it refreshes) the real world.

- A resource in the **state but not in the code** is something Terraform thinks it must destroy.
- A resource in the **code but not in the state** is something it thinks it must create.
- A renamed resource is both at once: the old name is in the state only, the new name is in the code only.

Four commands change that, and none of them touches the real world. They only edit what Terraform remembers:

| Command | What it does |
|---|---|
| `terraform state list` | Prints every address in the state. Read only. |
| `terraform state show ADDRESS` | Prints what the state knows about one resource. Read only. |
| `terraform state mv OLD NEW` | Renames an address in the state. The real thing is untouched. Use it for a rename. |
| `terraform state rm ADDRESS` | Makes Terraform forget a resource. The real thing stays. Use it to stop managing something without deleting it. |

Every state command that changes the state first saves the old one as `terraform.tfstate.<number>.backup`. That is your undo. Do not edit `terraform.tfstate` by hand.

## The files

| File | What it is |
|---|---|
| `before/main.tf` | Last month's code. Do not edit. `run.mjs` applies it first, so the state holds `local_file.notes`, `local_file.legacy` and `terraform_data.build`. |
| `main.tf` | This month's code: `notes` is now `readme`, and `legacy` is gone from the code. Do not edit. |
| `commands.txt` | **Yours.** One `terraform state ...` command per line. Empty in the starter. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-5-state/part-1-state-commands/test.mjs` | Fails on purpose, and says which line is missing. |
| 2 | Edit `commands.txt` | Goal: `terraform plan` says "No changes", and `out/legacy.txt` is still on disk. |
| 3 | `node challenges/challenge-5-state/part-1-state-commands/run.mjs` | Applies last month's code, shows the scary plan, runs your commands, plans again. About 40 seconds. |
| 4 | `node --test challenges/challenge-5-state/part-1-state-commands/test.mjs` | Passes when the plan says "No changes" and the file is kept. |
| 5 | `node toolkit/show-facts.mjs c5.p1` | Shows the saved numbers. |

Only `state list`, `state show`, `state mv`, `state rm` and `state pull` are accepted in `commands.txt`. Add `--reference` to `run.mjs`, or set `TFC_REFERENCE=1`, to run the solution in `reference/`.

## What you should see

1. **Apply of last month's code:** `Apply complete! Resources: 3 added`.
2. **`state list`** shows `local_file.legacy`, `local_file.notes`, `terraform_data.build`.
3. **The plan with this month's code, state untouched:** `local_file.legacy will be destroyed`, `local_file.notes will be destroyed`, `local_file.readme will be created`, and `Plan: 1 to add, 0 to change, 2 to destroy.`
4. **Your commands.** With the solution: `Successfully moved 1 object(s).` and `Successfully removed 1 resource instance(s).`
5. **The plan after:** `No changes. Your infrastructure matches the configuration.`
6. **On disk:** `out/legacy.txt` is still there. The folder holds `terraform.tfstate` plus one `terraform.tfstate.<number>.backup` per state command, each one holding the state as it was before that command.

If you run `state rm local_file.notes` by mistake and plan again, Terraform wants to *create* `readme`. That is what a wrong state command looks like: the plan shows it. Always plan after a state command.

The full recorded run is in [results.md](results.md).

![Resources to destroy before and after](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c5.p1.resources_in_state_count` | Lines of `terraform state list` after last month's apply. |
| `c5.p1.plan_before_add_count`, `c5.p1.plan_before_destroy_count` | The `Plan: N to add, ... N to destroy` line before your commands. |
| `c5.p1.commands_run_count`, `c5.p1.commands_failed_count` | Commands of `commands.txt` that ran, and commands that failed or were refused. |
| `c5.p1.plan_after_no_changes`, `c5.p1.plan_after_add_count`, `c5.p1.plan_after_destroy_count` | The plan after your commands. |
| `c5.p1.legacy_file_kept` | Whether `out/legacy.txt` still exists. |
| `c5.p1.backup_files_count` | Files named `terraform.tfstate.<number>.backup`, one per state command that changed the state. |
| `c5.p1.state_resources_after_count` | Resources in `terraform.tfstate` at the end. |

## What is different on your machine

- **Linux and WSL2, Docker Desktop, Codespace:** the same lines. By default the toolkit runs Terraform 1.17.1 from the official image; a local binary of 1.17 or newer prints the same, apart from the numbers in backup file names.
- The numbers in `terraform.tfstate.<number>.backup` and the resource ids differ on every run.

## Stuck?

- `Failed to install provider` or similar: another run was writing the shared plugin cache. `run.mjs` retries by itself.
- A command is "skipped": it is not one of the five allowed `state` commands, or the word `terraform` is in front of it. Write `state mv ...`, not `terraform state mv ...`.
- Start again: just run `run.mjs` again. It deletes `work/` and rebuilds everything.
- Nothing is left in Docker by this part. To be sure: `node toolkit/cleanup.mjs 5`.
