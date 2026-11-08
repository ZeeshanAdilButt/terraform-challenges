# Challenge 7, part 2: version a module with Git tags

**Time:** about 60 minutes. **Download:** none beyond part 1 (the Docker provider is already cached). Git must be installed on your machine: `run.mjs` uses it to build a repository. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Your team keeps its container module in a Git repository. A caller points at it with `?ref=main`, because that always gets "the latest". On Monday the module author renames an input and merges. Nobody touched the caller. On Tuesday its `terraform init` fails.

The pin you did not set is the pin that broke you. This part gives you a repository with three releases and a caller that does not pin. You will pin it, then change the pin on purpose and watch what Terraform does each time.

## The idea

A module can come from many **sources**. A local folder (`./modules/app`) has no versions: whatever is on disk is what you get. A **registry** source (`hashicorp/consul/aws`) has real versions and the `version = "~> 1.0"` argument. A **Git** source (`git::https://...`) has none of that: it has **refs**, which are branches and tags, and a ref is all the pin there is.

| What | Meaning |
|---|---|
| Git source | `source = "git::<address>?ref=<tag, branch or commit>"`. Here the address is a local repository, `file:///...`. A real team uses an HTTPS or SSH address. |
| Release tag | A name on one commit: `v1.0.0`. By custom, `MAJOR.MINOR.PATCH`. |
| Backwards compatible (minor) | Callers that worked keep working. New optional inputs and new outputs only. |
| Breaking (major) | Callers must change. A renamed or removed input, a removed output. |
| What `init` records | The source string in `.terraform/modules/modules.json`. It records the ref you wrote. It stores no commit id and no checksum. |

Three things to learn here:

1. A branch is not a pin. `?ref=main` means "whatever main is today".
2. A tag is a pin, but a tag can be moved. A commit id cannot.
3. `version = "..."` does not work on a Git source. Terraform says so, and you will see its words.

The repository is built for you by `run.mjs` in `work/modrepo`, from the three folders in `versions/`. Release 1.1.0 adds an optional input and an output. Release 2.0.0 renames the input `memory_mb` to `memory_limit_mb`. The default branch `main` ends at 2.0.0, like a repository you do not control.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-7-a-module/part-2-version-with-git/run.mjs` | Builds the repository, then runs `init` on `main.tf`. On the starter, `init` fails. |
| 2 | `node --test challenges/challenge-7-a-module/part-2-version-with-git/test.mjs` | Fails on purpose. |
| 3 | Edit the `?ref=` in `main.tf` | `main.tf` writes `REPO_URL`; `run.mjs` replaces it with the address of the repository. Only change the part after `?ref=`. Two fixes work: pin a release the caller already matches, or pin the newest and change the caller. |
| 4 | Run step 1 again | `init`, `plan`, `apply` and `destroy` for your caller, then a demo of what changing the ref does (about 3 more minutes). |
| 5 | `node --test challenges/challenge-7-a-module/part-2-version-with-git/test.mjs` | Passes. |
| 6 | `node toolkit/show-facts.mjs c7.p2` | Shows the saved facts. |

`reference/main.tf` is the solution (it pins `v1.1.0`). `TFC_REFERENCE=1 node challenges/challenge-7-a-module/part-2-version-with-git/run.mjs` runs it.

## What you should see

On the starter, `init` stops with:

```text
Error: Unsupported argument
An argument named "memory_mb" is not expected here.
```

That is the Monday-to-Tuesday failure: the caller is unchanged, the module is not.

After you pin, the run shows what `init` pinned, in `.terraform/modules/modules.json`: `Source` is the string you wrote, `Dir` is `.terraform/modules/app`, and nothing else. Then the demo (a scratch caller, not your `main.tf`) goes through these steps, each with its real output in [results.md](results.md):

| Step | What you see |
|---|---|
| Change `?ref=v1.0.0` to `?ref=v1.1.0` and run `plan` without `init` | `Error: Module source has changed`. Terraform wants `init`. |
| `init`, then `plan` at 1.1.0 | `No changes.` A compatible release changes nothing. |
| `?ref=v2.0.0` with the old argument | `init` fails with `An argument named "memory_mb" is not expected here.` |
| Rename the argument to `memory_limit_mb` | `No changes.` The upgrade changed the interface, not the containers. |
| Add `version = "~> 1.0"` to the module block | `Error: Invalid registry module source address`. A version constraint is for registry modules. |
| Move the tag `v1.1.0` to the 2.0.0 commit | A plain `init` and `plan` still pass: Terraform keeps the copy it has. `init -upgrade` fails with the rename error. |
| Pin `?ref=<commit id>` | `No changes.` That commit is the old 1.1.0 and cannot move. |

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c7.p2.tags_count` | Tags in `work/modrepo`. |
| `c7.p2.init_ok`, `c7.p2.plan_ok`, `c7.p2.apply_ok` | Exit codes of the steps on your `main.tf`. |
| `c7.p2.pinned_to_tag` | True when `?ref=` in your `main.tf` is one of the three tags. |
| `c7.p2.module_source_recorded` | The `Source` that `init` wrote to `.terraform/modules/modules.json`. |
| `c7.p2.destroyed_count` | The `N destroyed` of `terraform destroy` (5: image, two networks, two containers). |
| `c7.p2.upgrade_minor_changes_count` | Add, change and destroy of the plan after moving from 1.0.0 to 1.1.0. |
| `c7.p2.upgrade_major_plan_fails`, `c7.p2.upgrade_major_error` | Whether `init` failed at 2.0.0 with the old argument, and its error line. |
| `c7.p2.upgrade_major_fixed_changes_count` | Changes of the plan after the argument was renamed. |
| `c7.p2.stale_plan_error` | The error of `plan` after the ref changed without `init`. |
| `c7.p2.version_on_git_source_error` | The first error line when `version` is set on a Git source. |
| `c7.p2.moved_tag_plain_init_changes_count`, `c7.p2.moved_tag_upgrade_plan_fails` | Plan after a plain `init` with the tag moved (0 changes) and whether `init -upgrade` failed. |
| `c7.p2.commit_pin_changes_count` | Changes of the plan after pinning the commit id. |
| `c7.p2.leftover_count` | Docker objects still labelled `tfc.challenge=7`. |

## What is different on your platform

- **Linux and WSL2, Docker Desktop, Codespace:** the same. The repository lives in `work/modrepo`; inside the container it is `/work/modrepo`, which is why the source is `git::file:///work/modrepo?ref=...`. With a local Terraform binary, `run.mjs` writes the real path of the folder instead.
- **Git in the container:** the official Terraform image contains `git` (version 2.54.0 in the recorded run). Terraform needs it for every `git::` source. A minimal image without Git cannot install these modules.
- **Git on your machine:** only `run.mjs` uses it, to make the repository. The commit ids in your run differ from `results.md`.

## Stuck?

- `git is not available`: install Git, then run again.
- The ref is right and `init` still fails with `Unsupported argument`: your `main.tf` passes `memory_mb`; release 2.0.0 wants `memory_limit_mb`. Pin 1.1.0, or rename the argument and pin 2.0.0.
- `init` says `text file busy` or complains about checksums: another run was writing the shared plugin cache. `run.mjs` retries; run it again.
- Something is left over from a crashed run: `node toolkit/cleanup.mjs 7`.
