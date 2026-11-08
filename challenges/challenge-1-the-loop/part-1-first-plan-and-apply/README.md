# Challenge 1, part 1: first plan and apply

**Time:** about 60 minutes. **Download:** the `alpine:3.23` image (about 4 MB packed) if you do not have it, and the three providers (docker about 75 MB, random and local a few MB), once. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A teammate says: "The pipeline is red. It wants to change things nobody touched." You run `terraform plan` on a stack that was applied an hour ago, with no edits, and it prints `Plan: 1 to add, 1 to change, 1 to destroy.`

A plan that is never empty is a plan nobody reads. People start approving it without looking, and one day it also contains the line that deletes the database. A healthy configuration settles: apply it, plan again, and Terraform says **No changes**. In this part you get a configuration that does not settle, and you find out why.

## The idea

Terraform works in a loop:

1. You write a **configuration**: files that say what you want.
2. **`terraform plan`** reads the configuration, reads the real world, and prints the difference. It changes nothing.
3. **`terraform apply`** makes the difference real.
4. Terraform records what it made in **state**, so that next time it knows what is "already there".
5. Plan again. If the real world matches the configuration, the plan says `No changes.`

Words you need:

| Word | Meaning |
|---|---|
| resource | One thing Terraform manages: a file, a container, a random name. |
| address | The name of a resource inside Terraform: `type.name`, for example `docker_container.sleeper`. |
| provider | A plugin that knows how to make one family of resources. This part uses three: `random`, `local` (files) and `docker`. |
| the three counts | `Plan: 4 to add, 0 to change, 0 to destroy.` Add means create. Change means update in place. Destroy means remove. A replacement counts as one add and one destroy. |

The configuration in `main.tf` makes four resources: a `random_pet` (a random name), a `local_file` (a text file that says hello to the pet), a `docker_image` (`alpine:3.23`, kept on your machine) and a `docker_container` that only sleeps. The container uses the image, so Terraform builds the image first. You never wrote that order: Terraform worked it out from the reference `docker_image.alpine.image_id`.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-1-the-loop/part-1-first-plan-and-apply/test.mjs` | Fails on purpose: no facts yet. |
| 2 | `node challenges/challenge-1-the-loop/part-1-first-plan-and-apply/run.mjs` | Runs the loop on the starter `main.tf`: `init`, `plan`, `apply`, a look at Docker, a second `plan`, `state list`, `destroy`. About 2 minutes. |
| 3 | Read the second plan in the printout and in `challenges/challenge-1-the-loop/part-1-first-plan-and-apply/work/plan-2.txt` | It is not `No changes`. Find which values differ. |
| 4 | Edit `challenges/challenge-1-the-loop/part-1-first-plan-and-apply/main.tf` | Fix the three faults. Two have a `TODO`; one you find in the plan. |
| 5 | `node challenges/challenge-1-the-loop/part-1-first-plan-and-apply/run.mjs` | Run again. |
| 6 | `node --test challenges/challenge-1-the-loop/part-1-first-plan-and-apply/test.mjs` | Repeat steps 3 to 6 until it passes. |
| 7 | `node toolkit/show-facts.mjs c1.p1` | Shows the saved facts. |

`run.mjs` copies your files to a `work/` folder and runs Terraform there. It ends with `terraform destroy` and a label-based cleanup, so nothing stays on your machine except `alpine:3.23`.

## The three faults, as hints

1. **A value that changes on every plan.** One argument of `local_file.greeting` calls a function that returns a new value each time. Terraform sees "different from state" on every plan and has to replace the file. Look for `timestamp()`.
2. **An attribute the provider fills in.** You set `memory = 64`. Docker adds swap equal to the limit, so the real container says `memory_swap = 128`. Your configuration says nothing, so Terraform wants to set it back to null. Whatever the plan prints as `128 -> null`, you set explicitly.
3. **A container nobody can find.** The name has no `tfc-c1-` prefix and there is no `tfc.challenge=1` label, so `node toolkit/cleanup.mjs 1` could not remove it after a crashed run. Rule 2 of the SAFETY file.

## What you should see

On the starter, the second plan is not clean. The recorded reference run, after the fixes:

- The first plan: `Plan: 4 to add, 0 to change, 0 to destroy.` with a "will be created" line for each of the four resources.
- The apply: `Apply complete! Resources: 4 added, 0 changed, 0 destroyed.` The image and the pet start first, the container last.
- `docker ps` shows `tfc-c1-sleeper` running `sleep 3600`.
- The second plan: `No changes. Your infrastructure matches the configuration.`
- `terraform state list` shows the four addresses.
- `destroy` removes four resources, and `alpine:3.23` is still on your machine.

The pet name in your run differs from the recorded one. The full recorded run is in [results.md](results.md).

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c1.p1.plan1_add_count`, `plan1_change_count`, `plan1_destroy_count` | The `Plan:` line of the first plan (4, 0, 0). |
| `c1.p1.apply_added_count` | The `Apply complete!` line (4). |
| `c1.p1.container_named_tfc`, `container_labelled`, `container_running` | `docker inspect` of the container Terraform recorded in state. |
| `c1.p1.plan2_no_changes` | The second plan printed `No changes. Your infrastructure matches the configuration.` Must be true. |
| `c1.p1.plan2_add_count`, `plan2_change_count`, `plan2_destroy_count` | The `Plan:` line of the second plan (0 when it says No changes). |
| `c1.p1.state_resource_count` | Lines of `terraform state list` (4). |
| `c1.p1.destroy_destroyed_count` | The `Destroy complete!` line (4). |
| `c1.p1.leftover_after_destroy_count` | Docker objects labelled `tfc.challenge=1` still there after destroy (0). |
| `c1.p1.alpine_image_kept` | `docker image inspect alpine:3.23` still finds the image after destroy. |

## Platform box

| Where you run | What to know |
|---|---|
| Linux and WSL2 | As written. |
| Docker Desktop | As written. Each `plan` takes several seconds because the Docker provider starts inside a container. |
| GitHub Codespace | As written, with `TFC_MODE=docker` if you have no local Terraform 1.17. |
| Local Terraform, not the container | The plan text is the same. `greeting.txt` is written with your own file permissions. |

## Stuck?

- The second plan lists something you do not understand: open `work/plan-2.txt`. Every line with `~` or `-` or `+` in the left margin is a difference.
- `Error: Required plugins are not installed` or `text file busy` once: the plugin cache was being used by another run. The script waits and tries again by itself.
- A container named `sleeper` or `tfc-c1-sleeper` is left after a crash: `node toolkit/cleanup.mjs 1`. For the unlabelled starter container, `docker rm -f sleeper`. It is your own container; no other name is touched.
- Never delete `alpine:3.23` to "clean up". Other projects may use it.
