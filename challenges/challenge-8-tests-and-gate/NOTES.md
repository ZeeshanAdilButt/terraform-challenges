# Challenge 8 notes: tests and a plan gate

Built from real runs of Terraform 1.17.1 (image `hashicorp/terraform:1.17.1`, `TFC_MODE=docker`), `hashicorp/local` 2.9.1 (part 1), `kreuzwerker/docker` 4.6.0 (parts 2 and 3), Docker Engine 29.9.2, Windows 11 with Docker Desktop, Node 22.22.2.

## What each part proves

- **Part 1, `terraform test`.** A config that writes a web-server file has two faults (an off-by-one in `range`, a `>` that should be `>=`). Four run blocks are written and two fail on the starter: a failed `assert` prints a `Diff` with `- 1` and `+ 2`, and a failed `expect_failures`-style boundary run shows the validation message. The learner writes a fifth run (`expect_failures = [var.port]` for 70000). Then the run mutates the rendered port in a copy and shows two tests failing: a test that cannot fail on a broken config proves nothing.
- **Part 2, `mock_provider`.** The mocked tests run with no Docker socket. A mock makes up computed values; `network_data` is a list, the made-up list is empty, so `network_data[0].ip_address` fails with `Invalid index` until the learner adds `mock_resource` defaults. A real apply with Docker then disagrees with the mocked tests (a container with that name already exists), and the address Docker gives differs from the invented `10.0.0.5`.
- **Part 3, a plan gate.** A zero-dependency Node script reads `terraform show -json` and blocks any plan that deletes or replaces a resource whose existing `before.labels` has `tfc.protected = "true"`. The same-looking plans (`1 to add, 1 to destroy`) get different verdicts. A `check` block warns and the plan goes on; a `precondition` stops the plan but a plan file is still written, marked `errored`.

## Where reality differed from the plan or the dossier

1. **Terraform Policy (`-policies`) cannot run here.** `terraform plan -policies=./policies` (with an empty folder) prints the plan, then `Error: Failed to connect to policy engine` / `Failed to connect to policy engine: failed to connect to plugin: exec: "tfpolicy-plugin": executable file not found in $PATH.` The engine is a separate program that the official image does not contain. **The exit code is 0.** Without the folder: `Error: Invalid policy path`, `Terraform cannot find the policy path at ./policies.` The dossier (section 5) says the flag "no longer requires an experimental build"; that is true, and the plugin is what is missing. Recorded in `part-3-plan-gate/results.md`; not pursued further.
2. **`terraform plan` writes a plan file even when the plan fails.** With a failing `precondition` and `-out=pre.tfplan`, the file exists, `terraform show -json pre.tfplan` has `"errored": true`, and `terraform apply pre.tfplan` says `Error: Cannot apply incomplete plan`. My first draft said "no plan file is written"; the run showed otherwise. The gate learner must refuse errored plans.
3. **A plan with nothing to refresh needs no Docker.** `terraform plan` with the Docker provider and no state succeeded without the socket mounted (create actions do not contact the daemon). The "a real plan cannot work without Docker" step therefore uses `terraform apply`, which fails at the provider.
4. **`mock_provider` defaults accept a partial object.** `network_data = [ { ip_address = "10.0.0.5" } ]` is enough; the other attributes of the object are filled in.
5. **When the first run of a test file fails, later runs are `skip`ped.** The starter of part 2 prints `0 passed, 1 failed, 2 skipped`.
6. **Provider quirk: `memory_swap`.** Docker adds swap when only `memory` is set, and the provider then wants `memory_swap = N -> null` on every plan. The configs set `memory_swap` equal to `memory`.
7. **Shared plugin cache races.** Other builders use `.cache/plugins` at the same time. Runs sometimes failed with `text file busy`, `Required plugins are not installed` or a checksum mismatch for the cached package. `lib.mjs` retries `init` and the failed command (up to 3 times).
8. **Scanner (Trivy, TFLint) not run.** The brief made it optional ("only if it adds a lesson"). I judged that the gate, the check block, the precondition and the missing Policy plugin already cover the lesson, the local disk is tight (5.9 GB free at the end), and pulling a scanner image by digest takes a pass of research the time did not allow. The Trivy supply-chain point (pin by digest) is for the chapter text, citing the Docker course.
9. **Lock files.** Each part folder carries the `.terraform.lock.hcl` the reference run produced. They are the only generated files committed.

## Starter failures

Part 1: `run "default_upstreams"... fail` with `Test assertion failed`, `- 1` / `+ 2`; `run "lowest_allowed_port_is_accepted"... fail` with `port must be between 1024 and 65535.`; `Failure! 2 passed, 2 failed.` Part 2: `run "ip_is_an_address"... fail`, `Error: Invalid index`, `docker_container.web.network_data is empty list of object`. Part 3: the gate prints `gate: ok, 4 resource changes, none removes a protected resource.` for all three plans (exit codes 0, 0, 0).

## Lines to quote

Part 1 (`part-1-terraform-test/results.md`):

- `Failure! 2 passed, 2 failed.` (starter) and `Success! 5 passed, 0 failed.`, then `Failure! 3 passed, 2 failed.` for the mutated copy.
- `Error: Test assertion failed` ... `condition     = output.upstream_count == 2`.
- `port must be between 1024 and 65535.`

Part 2 (`part-2-mock-provider/results.md`):

- `Success! 4 passed, 0 failed.`
- `Error: Invalid index` and `docker_container.web.network_data is empty list of object` (starter).
- `Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c8-web" is already in use by container "..."`
- `ip_address = 172.27.0.2` against `mock value  = 10.0.0.5` (the address depends on the machine).

Part 3 (`part-3-plan-gate/results.md`):

- `BLOCKED: docker_container.db[0] would be delete then create, and it is tagged protected.`
- `BLOCKED: docker_container.db[0] would be delete, and it is tagged protected.`
- `Plan: 1 to add, 0 to change, 1 to destroy.` for both the web replacement (allowed) and the database replacement (blocked).
- `Warning: Check block assertion failed` / `web_memory_mb is above 128. This stack is meant to stay small.`
- `Error: Resource precondition failed` / `db_memory_mb must be at least 32: the database needs room to start.`
- `"errored": true` and `Error: Cannot apply incomplete plan`.
- `Error: Failed to connect to policy engine` and `"tfpolicy-plugin": executable file not found in $PATH.` with exit code 0.

## Platform differences

- Docker Desktop on Windows was the only platform run. The `172.27.0.2` address and the network pool are machine-specific.
- A local Terraform 1.17 or newer prints the same, except the provider install lines.
