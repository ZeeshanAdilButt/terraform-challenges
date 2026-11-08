# Challenge 4, part 1: the lock file

**Time:** about 35 minutes. **Download:** the `hashicorp/local` provider, a few MB per platform, from the Terraform registry (it needs the network the first time; the plugin cache keeps it afterwards). **Docker:** not used in this part. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

On Monday the pipeline is green. On Tuesday nobody changed the code, and the pipeline fails: the provider released a new version overnight and `terraform init` downloaded it. Or worse, it does not fail. It just plans something different on your laptop than it does on the CI runner.

The fix is a small file called `.terraform.lock.hcl`. This part makes you read it, break it, and fill it in for every machine your team uses.

## The idea

A **provider** is a plugin that Terraform downloads to talk to a service (here `hashicorp/local`, which writes files). Your configuration says which versions it accepts with a **version constraint**. `~> 2.9` means "2.9 or newer, but below 3.0". A constraint is a range. A range can match different versions on different days.

The **lock file** records the one version that `terraform init` actually chose, plus **checksums** (hashes) of the plugin, so a changed or swapped download is refused. Rules to remember:

- `init` with no lock file picks the newest version inside your constraint and writes the lock file.
- `init` with a lock file reuses the locked version. It does not look for a newer one.
- Only `terraform init -upgrade` moves the locked version.
- The lock file belongs in Git. Commit it. Review changes to it like code.
- `init` writes the checksum for the machine it runs on. A teammate on another operating system, or the CI runner, needs checksums for their platform too. `terraform providers lock -platform=...` adds them.

## The faults in the starter

| File | Fault |
|---|---|
| `main.tf` | The provider has no version constraint. The lock file then has no `constraints` line, and any version is allowed. |
| `team.gitignore` | A line hides `.terraform.lock.hcl` from Git, so the lock file can never be committed. |
| `platforms.txt` | Lists only `linux_amd64`. The team also uses Apple silicon Macs and Windows laptops. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-4-lock-file-and-graph/part-1-the-lock-file/test.mjs` | Fails on purpose. Each failure names the file to fix. |
| 2 | Edit `main.tf`, `team.gitignore`, `platforms.txt` | Read the comments that start with `FIX`. |
| 3 | `node challenges/challenge-4-lock-file-and-graph/part-1-the-lock-file/run.mjs` | Init and the lock file, an old lock against your constraint, `init -upgrade`, `providers lock`. About 1 minute. |
| 4 | `node --test challenges/challenge-4-lock-file-and-graph/part-1-the-lock-file/test.mjs` | Passes when the three faults are fixed and the run was recorded. |
| 5 | `node toolkit/show-facts.mjs c4.p1` | Shows the saved numbers. |

Add `--reference` to `run.mjs`, or set `TFC_REFERENCE=1`, to run the solution in `reference/` instead of your files.

## What you should see

With the fixed files, `run.mjs` does this inside its own `work/` folder:

1. **init and the lock file.** `init` finds the newest version matching `~> 2.9`, installs it, and writes the lock file. The `constraints` line records the rule. One `h1:` checksum, for the platform `init` ran on, plus the `zh:` checksums of the downloaded package files.
2. **An older lock.** A copy of the folder is first locked at version 2.8.0 (constraint `= 2.8.0`), as if a teammate committed it months ago. Then your constraint goes back in. `init` stops:

```text
Error: Failed to query available provider packages
...
hashicorp/local: locked provider registry.terraform.io/hashicorp/local 2.8.0
does not match configured version constraint ~> 2.9; must use terraform init
-upgrade to allow selection of new versions
```

3. **`init -upgrade`** installs 2.9.1 and rewrites the lock file. This is the only command that does.
4. **`providers lock`** for the platforms in `platforms.txt`. Each platform adds one `h1:` checksum.

With the starter files, step 2 behaves differently: your configuration has no constraint, so version 2.8.0 is still allowed and `init` quietly reuses it. Nothing is refused, and that is the danger. Compare the two outputs in your terminal.

The full recorded run is in [results.md](results.md).

![Checksums in the lock file](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c4.p1.gitignore_ignores_lock` | Whether a line of `team.gitignore` is exactly `.terraform.lock.hcl`. |
| `c4.p1.locked_version`, `c4.p1.lock_constraint` | The `version` and `constraints` lines in the lock file after the first `init` (`none` when there is no constraints line). |
| `c4.p1.lock_h1_hash_count`, `c4.p1.lock_zh_hash_count` | Count of `"h1:` and `"zh:` lines in that lock file. |
| `c4.p1.old_lock_version` | The version the `= 2.8.0` copy locked. |
| `c4.p1.init_refused_old_lock`, `c4.p1.init_old_lock_exit_code`, `c4.p1.refusal_line` | Whether `init` failed with the old lock and your constraint, its exit code, and the error sentence (spaces joined into one line). |
| `c4.p1.upgrade_version`, `c4.p1.upgrade_moved_version` | The version in the lock file after `init -upgrade`, and whether it changed. |
| `c4.p1.platforms_count` | Lines of `platforms.txt` that are not comments. |
| `c4.p1.lock_h1_hash_after_providers_lock_count` | Count of `"h1:` lines after `providers lock`. One per platform. |

## What is different on your machine

- **Linux and WSL2, Docker Desktop, Codespace:** the same output. By default the toolkit runs Terraform 1.17.1 from the official image, so the numbers do not depend on your operating system. A local `terraform` binary of 1.17 or newer prints the same lines, except that its own platform's `h1:` checksum differs from the container's (the container is `linux_amd64`).
- **A newer provider release:** if `hashicorp/local` has published a version after 2.9.1, `locked_version` and `upgrade_version` show the newer one. The shape stays the same.

## Stuck?

- `Failed to install provider`: another run was writing the shared plugin cache at the same moment. Run the command again. `run.mjs` retries by itself.
- You want to start again: delete the `work/` folder. Nothing outside `work/` is changed by `run.mjs`.
- Nothing is left in Docker by this part. To be sure: `node toolkit/cleanup.mjs 4`.
