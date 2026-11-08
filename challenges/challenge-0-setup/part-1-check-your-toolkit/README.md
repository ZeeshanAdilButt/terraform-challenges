# Challenge 0, part 1: check your toolkit

**Time:** about 30 minutes. **Download:** the `random` provider (about 10 MB) and, in container mode, the Terraform image (about 90 MB), once. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

You are on a new laptop. You clone a repository, run `terraform init`, and get "command not found". Or it works, and a teammate with another Terraform version gets a different plan from the same files. Or Docker is not running and the failure message is three layers deep.

Every later challenge assumes the same small base: Node can run the scripts, Docker can run containers, Terraform is the version the course used. This part checks all three in one minute, so a problem shows up here and not in the middle of challenge 5.

## The idea

**Terraform** is a program that reads files describing what you want (a *configuration*, written in a language called HCL) and makes the real world match. You run it from a folder. It has a few steps you will repeat all course:

| Command | What it does |
|---|---|
| `terraform init` | Downloads the *providers* the configuration needs. A provider is a plugin that knows how to make one kind of thing (random names, files, Docker containers). Writes `.terraform.lock.hcl`, which records the exact provider versions. |
| `terraform validate` | Checks syntax and types. Looks at nothing real. |
| `terraform plan` | Compares the configuration with what exists and prints what it would do. Changes nothing. |
| `terraform apply` | Does it. |
| `terraform destroy` | Removes what the configuration made. |

**State** is the file (`terraform.tfstate`) where Terraform remembers what it made. You meet it properly in module 1, chapter 3.

**Runner mode.** These challenges do not need Terraform on your PATH. `toolkit/tf.js` runs Terraform one of two ways:

- `docker`: the official `hashicorp/terraform:1.17.1` image, with your folder mounted. Same version everywhere. The reference runs use this.
- `local`: the `terraform` program on your PATH, if it is version 1.17 or newer.

Without a setting, local is used when your program is new enough, and docker otherwise. Force one with `TFC_MODE=docker` or `TFC_MODE=local`. To run OpenTofu instead, set `TFC_TOOL=tofu` (challenge 13 uses it).

The configuration in this part is tiny: one `random_pet`, which makes a random name such as `classic-gar-heron`. It creates nothing outside Terraform's own state, which makes it the safest first resource there is.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node toolkit/check-setup.mjs` | A short table. No line may say `FAIL`. |
| 2 | `node --test challenges/challenge-0-setup/part-1-check-your-toolkit/test.mjs` | Fails on purpose: no facts yet, and `main.tf` is not fixed. |
| 3 | Open `challenges/challenge-0-setup/part-1-check-your-toolkit/main.tf` | Two `TODO` comments: pin the provider, make the name three words. |
| 4 | `node challenges/challenge-0-setup/part-1-check-your-toolkit/run.mjs` | Setup check, version, `init`, `validate`, `plan`, `apply`, `output`, `destroy`. About 1 minute. |
| 5 | `node --test challenges/challenge-0-setup/part-1-check-your-toolkit/test.mjs` | Repeat steps 3 to 5 until it passes. |
| 6 | `node toolkit/show-facts.mjs c0.p1` | Shows the saved facts. |

`run.mjs` copies the files to a `work/` folder (ignored by Git) and runs Terraform there, so `.terraform/`, the lock file and the state never mix with the file you edit.

## What you should see

- The setup check lists Node, Docker, the runner mode, the Terraform version and free disk. No `FAIL`.
- `terraform version` prints `Terraform v1.17.1`. A local program of 1.17 or newer prints its own number; everything else is the same.
- `init` prints `Installing hashicorp/random v3.9.1...` and then `Terraform has been successfully initialized!`. The first run in a fresh repository downloads the provider; the next runs take it from the plugin cache in `.cache/plugins`.
- The plan ends with `Plan: 1 to add, 0 to change, 0 to destroy.` The apply ends with `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`
- The pet name is random. Yours is not the recorded one.

The full recorded run is in [results.md](results.md).

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c0.p1.node_major_version` | `process.versions.node` of the process that ran `run.mjs`. |
| `c0.p1.docker_engine_version` | `docker version --format {{.Server.Version}}`. |
| `c0.p1.runner_mode`, `c0.p1.tool_version` | `mode()` of `toolkit/tf.js`, and the first line of `terraform version`. |
| `c0.p1.setup_checks_failed_count` | Lines of `node toolkit/check-setup.mjs` that say `FAIL`. Must be 0. |
| `c0.p1.init_ok`, `c0.p1.validate_ok` | Exit code 0 of `terraform init` and `terraform validate`. |
| `c0.p1.lock_file_exists`, `c0.p1.random_provider_version` | The work folder's `.terraform.lock.hcl`. |
| `c0.p1.provider_pinned` | Your `main.tf` has `version = "~> 3.9"`. |
| `c0.p1.plan_add_count`, `c0.p1.apply_added_count`, `c0.p1.destroy_destroyed_count` | The counts on the `Plan:`, `Apply complete!` and `Destroy complete!` lines. |
| `c0.p1.pet_words_count` | Words in the pet name (split at `-`). Must be 3. |

## Platform box

| Where you run | What to know |
|---|---|
| Linux or WSL2 | Docker mode works as is. The toolkit adds your user and the Docker socket group to the container. |
| Docker Desktop (Windows, macOS) | Docker mode works as is. The first provider start inside the container can take several seconds. |
| GitHub Codespace | Docker is available. Use `TFC_MODE=docker`, or install Terraform 1.17 or newer and use local mode. |
| Local program, not the container | Output matches apart from the `terraform version` line (`on windows_amd64` instead of `on linux_amd64`) and the file paths in error messages. |

## Stuck?

- `Docker is not ready`: start Docker Desktop (or the docker service), wait until it says running, run again.
- `FAIL ... 2 GB of free disk`: free some space. Images are small, but provider plugins and state add up.
- `init` fails with a network error: it needs the internet once, to fetch the provider. Run it again; the plugin cache keeps what it got.
- `text file busy` from Terraform on Docker Desktop: the provider file was still being written. Run the command again.
- Something is left over: `node toolkit/cleanup.mjs 0` (this part makes no Docker objects, so it removes nothing).
