# Challenge 8, part 1: terraform test

**Time:** about 45 minutes. **Download:** the `local` provider (about 15 MB) the first time `init` runs. No Docker objects are created in this part. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A pull request changes one character in a validation rule. A second one renames a loop. Both are small, both look right, and the reviewer approves. Next week a teammate sets `port = 1024`, which the rule was meant to allow, and the plan fails. Another teammate asks for two replicas and the generated config lists one server.

Nobody ran the config with those inputs. A test would have.

## The idea

`terraform test` runs your configuration the way a unit test runs a function. You write a file that ends in `.tftest.hcl`, inside a `tests/` folder next to your code. It holds **run blocks**. Each run block is one test:

| Part of a run block | What it does |
|---|---|
| `command = plan` | Checks the plan only. Nothing is created. Fast. |
| `command = apply` | Really creates the resources, checks them, and destroys them when the test file ends. This is the default if you write nothing. |
| `variables { ... }` | Inputs for this run only. |
| `assert { condition, error_message }` | A condition that must be true. If not, the run fails and prints your message. |
| `expect_failures = [var.port]` | The run passes only if that variable's validation fails. This is how you test a rule that should refuse a value. |

Run blocks run in order. Later runs can use the state of earlier `apply` runs.

Two things to remember. First, a test that cannot fail is worth nothing, so this part also breaks the config on purpose to prove the tests notice. Second, `apply` runs make real things. Here the "real thing" is a small file in `out/`, so it is safe. With cloud resources an `apply` run costs money; that is why part 2 shows mocks.

The code under test writes a small web-server config file. `main.tf` has two faults. The test file has four tests written and one for you to write.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-8-tests-and-gate/part-1-terraform-test/run.mjs` | Copies the files to `work/`, runs `init` and `terraform test`. On the starter, two runs fail and the run stops. |
| 2 | `node --test challenges/challenge-8-tests-and-gate/part-1-terraform-test/test.mjs` | Fails on purpose. It names the runs that failed. |
| 3 | Read the failures. Fix `main.tf`. | Two runs fail for two different reasons. Decide for each: is the code wrong or the test? |
| 4 | Add the run block the TODO in `tests/main.tftest.hcl` asks for | A port that is too high (70000) must be refused. |
| 5 | Run step 1 again | All runs pass. The run then changes the rendered port in a copy of `main.tf` and shows the tests failing. |
| 6 | `node --test challenges/challenge-8-tests-and-gate/part-1-terraform-test/test.mjs` | Passes. |
| 7 | `node toolkit/show-facts.mjs c8.p1` | Shows the saved facts. |

The solution is in `reference/`. `TFC_REFERENCE=1 node challenges/challenge-8-tests-and-gate/part-1-terraform-test/run.mjs` runs it.

## What you should see

On the starter:

```text
  run "default_upstreams"... fail
  run "config_has_the_port"... pass
  run "privileged_port_is_refused"... pass
  run "lowest_allowed_port_is_accepted"... fail
Failure! 2 passed, 2 failed.
```

The first failure shows `Diff`, `- 1`, `+ 2`: the config lists one upstream server, the test expected two. The second failure is the validation message from `main.tf`, because port 1024 is refused by a rule that says it must be allowed.

On the reference: `Success! 5 passed, 0 failed.`, then in the copy with the rendered port changed, `Failure! 3 passed, 2 failed.` Two tests notice the change, not one. Everything is in [results.md](results.md).

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c8.p1.init_ok` | Exit code of `terraform init`. |
| `c8.p1.test_block_count` | Lines that start with `run "` in `tests/main.tftest.hcl`. |
| `c8.p1.test_passed_count`, `c8.p1.test_failed_count` | The line `Success! N passed, M failed.` (or `Failure!`) at the end of `terraform test`. |
| `c8.p1.file_left_after_test` | Whether `out/shop.conf` exists after `terraform test` finished. It should not: the apply run destroyed it. |
| `c8.p1.mutant_failed_count`, `c8.p1.mutant_caught` | The same summary line, for the copy where `listen ${var.port};` was replaced by `listen 80;`. |

## What is different on your platform

- **Linux and WSL2, Docker Desktop, Codespace:** the same output. The toolkit runs `hashicorp/terraform:1.17.1` unless a local Terraform 1.17 or newer is on your PATH.
- **Local binary:** `terraform test` needs Terraform 1.6 or newer. Use 1.17 to get the same output as the recorded run; the wording of failures can differ slightly between versions.
- **Docker socket:** this part does not need it. The toolkit mounts no socket here.

## Stuck?

- `terraform test` says `No tests found`: the file must end in `.tftest.hcl` and sit in `tests/`.
- A run fails and you do not know why: add `-verbose` (`terraform test -verbose`) to see the plan or state of each run.
- You are not sure whether to change the code or the test: read the `error_message` of the failing assert. It states what the author meant. If the code does not do that, fix the code.
- The test still fails after you fixed the module: run step 1 first. The test reads the numbers of the last run.
