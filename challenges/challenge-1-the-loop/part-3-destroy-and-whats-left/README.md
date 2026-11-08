# Challenge 1, part 3: destroy, and what is left

**Time:** about 45 minutes. **Download:** none if you did part 1 (`alpine:3.23` is already there); otherwise `alpine:3.23` (about 4 MB). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Someone runs `terraform destroy` to clean up their test stack. It finishes with `Destroy complete!`. An hour later a different project on the same laptop fails to start: its image is gone. Nobody pulled, nobody ran `docker rmi`. The `destroy` did it, because the `docker_image` resource did not say to keep the image.

`destroy` is not the dangerous word. **"What is left?"** is the question. This part shows exactly what a destroy leaves and takes, on throwaway names, so that you never find out on a shared image.

## The idea

`terraform destroy` removes every resource in state, in reverse order of dependency (things that use a resource go before the resource). For a container that is simple: it is stopped and removed. For an image it depends on one argument of `docker_image`:

| `keep_locally` | What `destroy` does to the image |
|---|---|
| `true` | Nothing. The image stays on your machine. |
| `false` (the default) | Removes the image **name** from your machine, and, when that was the image's last name, Docker deletes the image itself. |

Words you need:

- An **image name** is `repository:tag`, like `alpine:3.23`. One image can have many names. `docker tag alpine:3.23 tfc-c1-kept:1` adds a second name to the same image; both show the same id.
- A **layer** is a piece of an image. Removing the last name of an image lets Docker delete its layers.

You will set up three names that Terraform manages:

| Name | What it is | `keep_locally` | After destroy |
|---|---|---|---|
| `tfc-c1-throwaway:1` | A second name for `alpine:3.23` (same id) | `false` on purpose | The name is gone. `alpine:3.23` is untouched, because it is another name for the same image. |
| `tfc-c1-kept:1` | Another second name for `alpine:3.23` | you set it | Must still be there. |
| `tfc-c1-solo:1` | A tiny image of its own (alpine plus one layer), with one name | `false` on purpose | The name and the image are both gone. |

That is why this challenge uses made-up names: `alpine:3.23` and your other images are never managed here. `run.mjs` makes the names, and it removes them again at the end, by exact name.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-1-the-loop/part-3-destroy-and-whats-left/test.mjs` | Fails on purpose: no facts yet. |
| 2 | `node challenges/challenge-1-the-loop/part-3-destroy-and-whats-left/run.mjs` | Makes the three names, applies, destroys, and prints which names and images are left. About 1 minute. |
| 3 | Read the last step of the printout | `kept` is gone. Why? |
| 4 | Edit `challenges/challenge-1-the-loop/part-3-destroy-and-whats-left/main.tf` | Follow the `TODO` in `docker_image.kept`. Leave `throwaway` and `solo` as they are. |
| 5 | `node challenges/challenge-1-the-loop/part-3-destroy-and-whats-left/run.mjs` | Run again. |
| 6 | `node --test challenges/challenge-1-the-loop/part-3-destroy-and-whats-left/test.mjs` | Repeat steps 3 to 6 until it passes. |
| 7 | `node toolkit/show-facts.mjs c1.p3` | Shows the saved facts. |

## What you should see

The recorded reference run, in the step "docker image inspect <each name>":

- `alpine:3.23` has the same image id before and after.
- `tfc-c1-throwaway:1`: before, the same id as alpine. After: `gone`. Only the name went. The image lives on as `alpine:3.23`.
- `tfc-c1-kept:1`: still there, because of `keep_locally = true`.
- `tfc-c1-solo:1`: `gone`, and `docker image inspect` on its old id fails: the image was deleted.

The full recorded run is in [results.md](results.md), and the chart shows what was still there after the destroy.

![Names still on the machine after destroy](chart.svg)

**The rule for real projects:** every `docker_image` gets `keep_locally = true`. This repository's SAFETY rule 5 says the same, and every other challenge follows it. This part is the one place that sets it to `false`, and only on names it made up.

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c1.p3.apply_added_count`, `c1.p3.destroy_destroyed_count` | The `Apply complete!` and `Destroy complete!` lines (3 and 3). |
| `c1.p3.alpine_present_after`, `c1.p3.alpine_id_unchanged` | `docker image inspect alpine:3.23` after the destroy, and its id compared with the id before. |
| `c1.p3.throwaway_present_after`, `kept_present_after`, `solo_present_after` | `docker image inspect <name>` after the destroy. |
| `c1.p3.solo_image_deleted` | `docker image inspect <the old id of solo>` fails after the destroy. |
| `c1.p3.names_removed_count` | How many of the three names are gone (2 in the reference run). |

## Platform box

| Where you run | What to know |
|---|---|
| Linux and WSL2 | As written. |
| Docker Desktop | As written. |
| GitHub Codespace | As written. |
| Local Terraform, not the container | Same result: the Docker provider acts on the Docker engine, not on where Terraform runs. |

## Stuck?

- A name such as `tfc-c1-kept:1` is left after a crash: `docker image rm tfc-c1-kept:1`. Use the exact name. Never `docker image prune`.
- `alpine:3.23` is missing: `docker pull alpine:3.23`. Nothing in this challenge removes it, but a crash in a different project might.
- `kept` is still gone after your edit: `keep_locally` goes inside the `docker_image.kept` block, as `keep_locally = true`.
