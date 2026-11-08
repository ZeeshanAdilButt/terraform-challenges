# Challenge 8, part 2: mock_provider, and what a mock cannot tell you

**Time:** about 45 minutes. **Download:** none beyond what parts before this one cached (the Docker provider, `alpine:3.23`). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A test file that uses `command = apply` creates real resources. On a laptop with Docker that is a container and a network. On a team with a cloud account it is a database that costs money, takes ten minutes to start, and needs credentials the CI job may not have. So people stop writing apply tests, or stop running them.

A **mock provider** answers that: it replaces the real provider for the length of a test, so no engine is needed and nothing is created. The price is that the provider is now your own guess. This part shows what you get, what you pay, and the one thing a mock can never tell you.

## The idea

`mock_provider "docker" {}` in a test file tells `terraform test` to use a fake Docker provider. Every resource is made up in memory. Values you set in the configuration are kept. Every value the real provider would compute (an id, an IP address, a list of network data) is generated:

| Type | What the mock makes up |
|---|---|
| string | a random 8-character string |
| number | 0 |
| boolean | false |
| list, map, set | empty |

An empty list is the trap. `docker_container.web.network_data[0].ip_address` fails on an empty list with `Invalid index`. You fix it with `mock_resource` and `defaults`: you decide what the provider "would have" returned.

| Block | Use |
|---|---|
| `mock_provider "name" { }` | Replace a provider for the whole test file. |
| `mock_resource "type" { defaults = { ... } }` | Values for the computed attributes of every resource of that type. |
| `mock_data "type" { defaults = { ... } }` | The same for data sources. |
| `override_resource`, `override_data`, `override_module` | Replace one specific resource, data source or module. |

What a mock proves: your expressions, conditions and wiring are right. What it cannot prove: that Docker agrees. The run below makes the two disagree.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-8-tests-and-gate/part-2-mock-provider/run.mjs` | Copies the files, runs `init` and `terraform test` with no Docker socket. On the starter the first run fails and the rest are skipped. |
| 2 | `node --test challenges/challenge-8-tests-and-gate/part-2-mock-provider/test.mjs` | Fails on purpose. |
| 3 | Edit `tests/mock.tftest.hcl` | Give the mock the value the tests rely on (`mock_resource` with `defaults`), then write the run block the TODO asks for. |
| 4 | Run step 1 again | The mocked tests pass with no Docker. Then a real `apply` is tried without Docker, and with Docker while another container holds the name. |
| 5 | `node --test challenges/challenge-8-tests-and-gate/part-2-mock-provider/test.mjs` | Passes. |
| 6 | `node toolkit/show-facts.mjs c8.p2` | Shows the saved facts. |

The solution is in `reference/`. `TFC_REFERENCE=1 node challenges/challenge-8-tests-and-gate/part-2-mock-provider/run.mjs` runs it.

## What you should see

On the starter, the first run fails and the others are skipped:

```text
  run "ip_is_an_address"... fail
  run "container_joins_the_app_network"... skip
  run "memory_limit_is_set"... skip
Failure! 0 passed, 1 failed, 2 skipped.
Error: Invalid index
```

On the reference, `Success! 4 passed, 0 failed.` with no Docker socket mounted. Then three things happen, with the real output in [results.md](results.md):

1. A real `terraform apply` without the Docker socket fails: the provider cannot reach Docker. The mocked tests never needed it.
2. The run starts a container named `tfc-c8-web` by hand. A real `apply` with Docker then fails with `Error response from daemon: Conflict. The container name "/tfc-c8-web" is already in use`. The mocked tests said the config was fine. They could not know the name was taken.
3. After the blocker is removed the real apply works, and `terraform output -raw ip_address` prints the address Docker chose (`172.27.0.2` in the recorded run), not the `10.0.0.5` the mock invented. An assertion about a computed value tests your mock, not Docker.

So: use mocks for logic, wiring and validation. Use a real apply (in a throwaway project or a sandbox) for facts only the real system knows: names that must be unique, quotas, permissions, addresses, timing.

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c8.p2.init_ok` | Exit code of `terraform init`. |
| `c8.p2.test_block_count` | Lines that start with `run "` in `tests/mock.tftest.hcl`. |
| `c8.p2.test_passed_count`, `c8.p2.test_failed_count` | The `N passed, M failed` line of `terraform test`. |
| `c8.p2.apply_without_docker_fails` | True when `terraform apply` with no Docker socket exits with an error. |
| `c8.p2.real_apply_conflict` | True when the real apply failed with `already in use` while the blocker container existed. |
| `c8.p2.real_apply_after_removal_ok` | Exit code of the real apply after the blocker was removed. |
| `c8.p2.real_ip_differs_from_mock` | True when the address Docker gave is not `10.0.0.5`. |
| `c8.p2.destroyed_count`, `c8.p2.leftover_count` | The `N destroyed` of `terraform destroy`, and the Docker objects still labelled `tfc.challenge=8`. |

## What is different on your platform

- **Linux and WSL2, Docker Desktop, Codespace:** the same output. The address in the last step depends on the Docker network pool of your machine (`172.27.0.2` here). The test only needs it to differ from the mock.
- **Local binary:** `mock_provider` needs Terraform 1.7 or newer. Use 1.17 to match the recorded run.
- **Docker socket:** the mocked tests and the first real apply run with no socket. The toolkit mounts the socket only for the real apply with Docker.

## Stuck?

- `Invalid index ... network_data is empty list of object`: the mock made up an empty list. Add the `mock_resource` block with `defaults = { network_data = [ { ip_address = "10.0.0.5" } ] }`.
- You used a different address in the mock: the test you write must use the same one. The TODO uses `10.0.0.5`.
- The real apply conflicts for a reason other than the blocker: run `node toolkit/cleanup.mjs 8`.
- The test still fails after you fixed the mock: run step 1 first. The test reads the numbers of the last run.
