# Notes for challenge 14 (the capstone)

Module 13 of the course: Capstone. Headline interview question: defend your platform, what breaks, how do you know, how do you recover? The learner submits a public copy of this repository. The shared capstone checker reads the files under `capstone/`, the pinned actions of the workflow, a tag `capstone-v*` and the latest GitHub Actions run. It never runs learner code on our servers: "the build and the tests pass" means the CI run on the tagged commit.

All outputs below come from real runs of Terraform 1.17.1 in docker mode (`TFC_MODE=docker`) on Docker Desktop, Engine 29.9.2, with `kreuzwerker/docker` 4.6.0, `nginx:1.27-alpine` and `valkey/valkey:8-alpine`. Facts are in [FACTS.md](FACTS.md).

## What is different from the other challenges

- **The learner's files are not in the part folders.** The checker reads `capstone/` at the top of the repository, so that is where the starter lives (`capstone/` and `.github/workflows/terraform.yml`). Each part's `run.mjs` copies them to its own `work/` folder (`prepareCapstone` in `lib.mjs`). With `--reference` it lays the `reference/` folders of parts 1 to N over the copy, so every part starts from a platform that works. Each `reference/` mirrors the layout of the repository root.
- **Template files that stay in the learner copy and that the checker compares with the template tag:** `.github/workflows/ci.yml`, `capstone/ci/pipeline.mjs`, `capstone/versions.tf`, the `backend.hcl` files, the lock files, `challenges/challenge-14-capstone/shape.mjs` and `capstone.test.mjs`. The learner writes `modules/service`, `envs/*/main.tf`, `tests/`, `gate/plan-gate.mjs`, `.github/workflows/terraform.yml`, `RUNBOOK.md` and `DEFENCE.md`.
- **`capstone.test.mjs` is the test CI runs.** One test per check of `shape.mjs`, no Docker. It runs the learner's plan gate on nine made-up plans. The reference passes all 76 checks. In the template repository, which holds the starter, it fails on purpose, so the template's own CI is red until a learner finishes. The checks do not judge prose: they look for headings, the real error lines, a link line, 40-character SHAs, a minimum number of words per answer.
- **A part that only reads and checks (part 4) still has a recorded run.** It prints the checklist by rubric area and runs `capstone.test.mjs` as its own process.

## What each part proves

| Part | Folder | What the learner sees fail | What it proves |
|---|---|---|---|
| 1 | `part-1-define-the-platform` | `terraform test` on the starter: `Reference to undeclared resource`, `Missing expected failure`. A plan with `memory_mb = 4096` is refused. The dev token on the prod state is refused. `terraform destroy` in prod is refused. | A module with a small interface and validation, two roots with one state each, three kinds of test (plan, `expect_failures`, mock). Created is not working: the web container answers and reaches the cache by name, which no mock can tell. Credentials per environment. `prevent_destroy` lives in the root, not in the module (a variable cannot feed it in Terraform 1.17.1, see challenge 10). |
| 2 | `part-2-ship-it-through-a-pipeline` | The starter gate passes everything and the workflow names tags. A new cache image tag is blocked by the gate. A volume rename is stopped by `prevent_destroy` in the plan step. A saved plan goes stale. | The pipeline steps run locally exactly as the workflow runs them (`capstone/ci/pipeline.mjs`). Two guards in two places. Apply the saved file, never plan again. Every pin is checked against GitHub with `gh api`. Plan on one fresh state server and apply on another works, which is what two GitHub jobs do. |
| 3 | `part-3-break-it-and-recover-it` | A failed apply (port taken), a stuck lock, a lost state, each with the real error text. | Recovery by fix and apply (the plan says tainted), by `force-unlock` after checking the holder, and by `state push -force` of a copy made with `state pull`. The data survives all three because it lives on a volume. |
| 4 | `part-4-the-defence` | The starter fails the checklist in six of seven areas. | The checklist the rubric is built on, and the test CI runs. |

## Problems hit, and deviations from the roadmap and the dossier (with evidence)

1. **`terraform test` needs a root that names the provider.** `-test-directory` must be inside the configuration folder: `Error: Invalid testing directory` with `The testing directory must be a relative path pointing to a directory local to the configuration directory.` The spec puts the tests in `capstone/tests/`, so the tests run from `capstone/` and every run block names the module (`module { source = "./modules/service" }`). A `mock_provider "docker"` with no `required_providers` in that folder resolves to `hashicorp/docker`: `Error: unknown provider registry.terraform.io/hashicorp/docker`. The `source` argument of `mock_provider` is not a provider source: `Mock data directory kreuzwerker/docker does not exist or cannot be read`. So `capstone/versions.tf` (a root with only `required_providers`) is part of the template. `terraform init` in `capstone/` finds the module through the run blocks.
2. **The cache container is protected by the gate, the data volume by `prevent_destroy`.** `prevent_destroy` cannot take a variable in 1.17.1 (challenge 10 notes), so the module cannot switch it per environment. The volume is created in each root (the caller owns the data) and only prod's carries `prevent_destroy = true`. The module takes the volume name and a `protected` bool that becomes the label `tfc.protected` on the cache container, which the plan gate reads.
3. **A lost state fails on the network first, not on a container name.** `terraform apply` on an empty state stops with `Error: Unable to create network: Error response from daemon: network with name tfc-c14-dev-net already exists`. The Docker provider checks for a duplicate network name. In challenge 5 (one container only) the error was the container name. That apply also writes a partial new state, so `terraform state push` of the copy needs `-force`.
4. **`terraform state list` with the `http` backend and a deleted state** prints `No state file was found!` (the same text as the local backend).
5. **In docker mode the toolkit passes only the variables named in `env`** to the container. `TF_HTTP_USERNAME` and `TF_HTTP_PASSWORD` set in the shell of `pipeline.mjs` never reached Terraform (`Error: Error loading state: HTTP remote state endpoint requires auth` at the first plan). `pipeline.mjs` now passes those two variables explicitly. In local mode the whole environment is inherited.
6. **Docker mounts only the folder it is given.** An environment calls `../../modules/service`, which is outside `envs/dev`. All Terraform runs use `cwd = capstone/` and `-chdir=envs/<env>`.
7. **The shared provider cache is racy.** With other builders running, in three tries in a new folder, two inits failed with `text file busy` or `the cached package ... does not match any of the checksums recorded in the dependency lock file`. `lib.mjs` (`terra`, `initTf`, `runNode`) waits and retries. The three lock files are the one from challenge 7 (same constraint `~> 4.6`, hashes of every platform as `zh:` plus the Linux `h1:`); a learner on their own machine does not meet the race. A local-binary learner on Windows or macOS may get an extra `h1:` line written by `init` (not tried here).
8. **One extra image.** `valkey/valkey:8-alpine` (61.6 MB) is the cache: a cache that answers `PING` is more honest than `alpine` with `sleep`. It is the only download of the challenge, once. The project brief lists only `alpine:3.23` and `nginx:1.27-alpine`; say in the course text that this one is new.
9. **`facts.json` is shared and Windows refuses a rename while another run holds it** (`EPERM`). `saveFacts` in `lib.mjs` waits and writes again until the values read back.
10. **Running a part with the starter overwrites the facts of that part** with their "not done" values (every run resets them). Run the reference last.
11. **What Terraform printed for a blocked plan:** `Plan: 2 to add, 1 to change, 2 to destroy.` for a new cache image tag: the image resource and the cache container are replaced, and the web container is updated in place.

## What only GitHub can prove (not run here)

- That GitHub accepts `terraform.yml` and `ci.yml` and runs them. Both were linted with `actionlint` 1.7.7 (container `rhysd/actionlint:1.7.7`): no findings. Every `uses:` SHA was checked with `gh api repos/<owner>/<repo>/commits/<tag> -q .sha` for its tag (run.mjs of part 2 does it again for the learner's file).
- That the plan artifact reaches the apply job, that `environment: ${{ matrix.env }}` with `secrets.STATE_TOKEN` works (the environments are created on first use), that the concurrency group queues a second run, and that `max-parallel: 1` orders dev before prod.
- That the runner can run the whole thing: `ubuntu-24.04` has Docker and `curl`, the job starts the teaching state server in the background (`node toolkit/state-server.mjs --port 8850 ... &`), the Docker provider pulls `nginx:1.27-alpine` and `valkey/valkey:8-alpine`, ports 18401 and 18402 are free. Locally the same plan and apply were proven on two separate, empty state servers (part 2, last step).
- That `ci.yml` is green on the tagged commit: `capstone.test.mjs`, `terraform fmt -check`, `terraform validate` in both environments and `terraform test` with the mocked provider. Locally the same commands pass in docker mode.
- The lock files hold the `h1:` hash of `linux_amd64`, the platform of the runner.

## Lines to quote

Exact text from the reference runs (`results.md` of each part).

Part 1:

- `Success! 11 passed, 0 failed.`
- `Error: Invalid value for variable` with `memory_mb must be between 16 and 256.` and `This was checked by the validation rule at ../../modules/service/variables.tf:36,3-13.`
- `Error: Error loading state: HTTP remote state endpoint requires auth`
- `Error: Instance cannot be destroyed` with `Resource docker_volume.cache_data has lifecycle.prevent_destroy set, but the plan calls for this resource to be destroyed.`
- `cache answered the web container with: +PONG`
- Starter only: `Error: Reference to undeclared resource`, `Error: Missing expected failure`, `Failure! 0 passed, 2 failed.`

Part 2:

- `BLOCKED: module.service.docker_container.cache would be delete then create, and it is labelled protected.`
- `Plan: 2 to add, 1 to change, 2 to destroy.` (new cache image tag), `Plan: 0 to add, 1 to change, 0 to destroy.` (memory 128 to 96)
- `Error: Instance cannot be destroyed` (volume rename, in the plan step)
- `Error: Saved plan is stale` with `The given plan file can no longer be applied because the state was changed by another operation after the plan was created.`
- `verified: the tag points to this commit` for each of the five actions.

Part 3:

- `Error: Unable to start container: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint tfc-c14-dev-web (...): Bind for 127.0.0.1:18401 failed: port is already allocated`
- `# module.service.docker_container.web is tainted, so must be replaced` and `Plan: 1 to add, 0 to change, 1 to destroy.`
- `Error: Error acquiring the state lock` with `Lock Info:` and the fields `ID:`, `Path:`, `Operation:`, `Who:`, `Version:`, `Created:`, `Info:`
- `Terraform state has been successfully unlocked!`
- `No state file was found!` and `Plan: 6 to add, 0 to change, 0 to destroy.` (both containers still running)
- `Error: Unable to create network: Error response from daemon: network with name tfc-c14-dev-net already exists`

Part 4:

- The checklist table: `module`, `envs`, `tests`, `gate`, `workflow`, `runbook`, `defence`, each `ok`.

## Differences per platform

- Ids, timestamps, lock IDs and tokens differ on every run. Counts and messages do not. The recorded lock ID is a fixed value made by `run.mjs`.
- Docker mode reaches the state server through `host.docker.internal`; local mode through `127.0.0.1`. `backend.hcl` always says `127.0.0.1`: `pipeline.mjs` and `lib.mjs` replace the host and port, and keep the name after `/state/`.
- Ports: 8850 (the state server the workflow starts, and part 1), 8851 (part 2), 8852 (part 3), 18401 (dev web), 18402 (prod web). Part 3 holds 18401 on purpose with a container named `tfc-c14-squatter`.
- Measured on Docker Desktop for Windows with the images and the provider cached: part 1 about 2 minutes, part 2 about 4, part 3 about 2, part 4 about 10 seconds. Every Terraform command starts a container, so a busy machine is slower.
