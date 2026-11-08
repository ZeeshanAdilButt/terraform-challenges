# Challenge 14, part 1: define the platform

**Time:** about 3 hours. **Download:** about 60 MB, once: the image `valkey/valkey:8-alpine` (the cache). The `nginx:1.27-alpine` image and the Docker provider are on your machine from earlier challenges. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Your team needs the same small platform twice: once to try things on (`dev`), once for real (`prod`). Someone copies the Terraform files into two folders and edits them. Six weeks later the two copies differ in nine places, nobody knows which differences are on purpose, and a `terraform destroy` typed in the wrong folder removes the real one.

This is the first of four parts that make your capstone: a platform you define, ship through a pipeline, break on purpose and recover. By the end of part 4 you defend it. Your work lives in the folder `capstone/` at the top of this repository, because that is where the checker looks.

## The idea

A **module** is a folder of Terraform files that you call like a function. The inputs are **variables**. The answers are **outputs**. A good module has a small interface and refuses bad input early. You wrote one in challenge 7. Here you write the module that both environments share.

The platform has two parts on one Docker **network** (a private virtual cable between containers):

- a **web** container (`nginx`), published on one port of your own machine (`127.0.0.1`, nobody else can reach it),
- a **cache** container (`valkey`, a fast key-value store), which keeps its data on a **volume** (a folder Docker keeps outside the container, so it survives when the container is removed).

Then two **root configurations**, `capstone/envs/dev` and `capstone/envs/prod`. A root is the folder where you run `terraform plan`. Each one calls the module, and each one has its own **state** (the file where Terraform remembers what it built). The state of each environment is kept on a **state server**, with the `http` backend you met in challenges 5 and 10. One state per environment means a mistake in one cannot reach the other.

Three guards sit between you and a mistake:

1. **Validation** inside the module: a port below 1024 or the tag `latest` is refused before anything is planned.
2. **`prevent_destroy`** on the data volume in `prod`: Terraform refuses any plan that destroys it. The guard is written in the root of `prod`, not in the module, because the module is shared with `dev`, where you do want to destroy things.
3. **Tests**: `terraform test` checks the module with the Docker provider **mocked** (replaced by a fake that answers in memory), so the tests run in seconds with no Docker engine. CI runs them on every push.

## Your task

The starter is in `capstone/`. Every `TODO (part 1)` comment says what to write. Work in this order.

1. **The module** `capstone/modules/service`: write the validation rules in `variables.tf`, the two containers in `main.tf`, the outputs in `outputs.tf`, and pin the provider in `versions.tf`.
2. **The roots** `capstone/envs/dev/main.tf` and `capstone/envs/prod/main.tf`: call the module, hand back two outputs. In `prod`, add `prevent_destroy = true` to the volume. The `backend.hcl` files are done: read them. Each one names a different state.
3. **The tests** in `capstone/tests`: three files are started. Finish them: at least 3 plan tests, 5 failing-validation tests (`expect_failures`) and 3 mock tests.
4. Run the experiment. It builds both environments for real and checks that the platform works.

Two things a mocked test cannot tell you, and this part checks against the real Docker engine: that the web container answers on its port, and that it can reach the cache by name.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-14-capstone/part-1-define-the-platform/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | Edit the files in `capstone/` (see above) | Write the module, the roots, the tests. |
| 3 | `node challenges/challenge-14-capstone/part-1-define-the-platform/run.mjs` | About 3 minutes. Formats, tests, builds dev and prod, checks the platform, tries three things that must fail, destroys everything. |
| 4 | `node --test challenges/challenge-14-capstone/part-1-define-the-platform/test.mjs` | Passes when the platform is defined and works. |
| 5 | `node toolkit/show-facts.mjs c14.p1` | Shows the saved numbers. |
| 6 | `git add capstone && git commit -m "Capstone part 1: the platform"` | Keep your work. Never commit a `terraform.tfstate`: the checker looks for one. |

Add `--reference` to step 3 to run the solution instead of your files. Add `--record` to write `results.md` and `chart.svg` from your own run. The run starts from a fresh `work/` copy of `capstone/` every time, so it never changes your files (except in `work/`).

## What you should see

The recorded run is in [results.md](results.md). In short:

- `terraform fmt -check` prints nothing. `terraform test` ends with `Success! 11 passed, 0 failed.`
- Each environment adds 6 objects: two images, a volume, a network and two containers. The state server holds two state files, `dev/platform.json` and `prod/platform.json`, and no `terraform.tfstate` is in either folder.
- The web container of each environment answers `HTTP 200`. The web container asks the cache `PING` and gets `+PONG`.
- A plan right after the apply says `No changes.` in both environments.
- `memory_mb = 4096` fails with `memory_mb must be between 16 and 256.`
- The dev token on the prod state fails with `Error loading state: HTTP remote state endpoint requires auth`.
- `terraform destroy` in prod fails with `Error: Instance cannot be destroyed` and the containers stay.

With the starter, `terraform test` fails: the first run block refers to a container that is not written yet, and the first failing-validation test says `Missing expected failure`.

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c14.p1.tests_passed_count`, `c14.p1.tests_failed_count` | The summary line of `terraform test`. |
| `c14.p1.apply_dev_added_count`, `c14.p1.apply_prod_added_count` | `N added` in the `Apply complete!` line of each environment. |
| `c14.p1.state_files_count` | The `.json` files the state server holds. |
| `c14.p1.web_dev_status`, `c14.p1.web_prod_status` | The HTTP status of a request to each web port. |
| `c14.p1.web_reaches_cache` | The answer to `PING`, sent from the web container with `nc`. |
| `c14.p1.prod_destroy_error` | The first `Error:` line of `terraform destroy` in prod. |

## Platform box

- **Linux and WSL2:** works as written. **Docker Desktop:** works as written; Terraform in its container reaches the state server through `host.docker.internal`. **Codespace:** works as written.
- **Local binary or container:** with Terraform 1.17 or newer on your PATH you get the same output. The reference run used the container `hashicorp/terraform:1.17.1` (`TFC_MODE=docker`).
- Ports used: 8850 (state server), 18401 (dev web), 18402 (prod web). If your machine uses the web ports, change them in `capstone/envs/*/main.tf` (and in the tests, which name the ports). The state server port is set at the top of `run.mjs`.

[SAFETY.md](../../../SAFETY.md)
