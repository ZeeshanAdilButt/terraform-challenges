# Challenge 7, part 1: build a module and call it for two environments

**Time:** about 60 minutes. **Download:** the Docker provider (about 75 MB unpacked) the first time `init` runs; `alpine:3.23` is already on your machine from challenge 0. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Someone pastes the same container block into the `dev` folder, then into `prod`, then into `staging`. Six months later the memory limit has three different values, one copy still runs an old image, and nobody can say which copy is the right one. So you move the block into a module. The module works for `dev`. You call it a second time for `prod` and it fails, or worse, it works and prints a secret.

This part gives you a module that was written in a hurry. It creates one container on one network. It breaks as soon as you call it twice. Your job is to find out why, one error at a time, and fix it.

## The idea

A **module** is a folder of `.tf` files that you use from another folder. The folder you run `terraform` in is the **root module**. When it contains `module "app" { source = "./modules/app-container" }`, Terraform reads that folder too and treats it as part of the same plan.

A module has three parts, and together they are its **interface**:

| Part | In the file | What it means |
|---|---|---|
| Inputs | `variable` blocks | What the caller may set. Give each one a `type`, a `description` and, where there are rules, a `validation` block. |
| Resources | `resource` blocks | What the module builds. The caller does not see inside. |
| Outputs | `output` blocks | What the caller may read back. Every output is a promise: change it and callers break. |

Four rules this part makes you meet:

1. **A module says which provider it needs** in `required_providers`. It does not configure it. Settings such as the Docker `host` belong to the caller's `provider` block. A module with its own `provider` block cannot be called with `for_each`, `count` or `depends_on`.
2. **Names come from inputs.** A name written inside the module is the same in every copy. Docker, like most systems, does not allow two containers with one name.
3. **Inputs get rules.** A `validation` block turns a bad value into a clear error at plan time, before anything is created.
4. **Outputs are chosen, not dumped.** `output "x" { value = docker_container.this }` hands the caller everything, including the environment variables. Outputs show up in `terraform output -json`, in state and in the plan.

`for_each` on a `module` block makes one copy per key of a map. Here the keys are the environments, `dev` and `prod`, so you get `module.app["dev"]` and `module.app["prod"]`.

The fault ladder below is the order in which you will meet the problems. Fix one, run again, read the next.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-7-a-module/part-1-build-and-call/run.mjs` | Copies the files to `work/`, runs `init`, `plan`, `apply`, reads the outputs, tries two bad inputs, plans again, destroys. It stops at the first step that fails and tells you which file to look at. |
| 2 | `node --test challenges/challenge-7-a-module/part-1-build-and-call/test.mjs` | Fails on purpose. Each failure says what to change. |
| 3 | Edit the files in `modules/app-container/` | The root `main.tf` is correct: leave it alone. |
| 4 | Repeat steps 1 and 3 until step 1 reaches the end | The run takes about 2 minutes once `init` works. |
| 5 | `node --test challenges/challenge-7-a-module/part-1-build-and-call/test.mjs` | Passes. |
| 6 | `node toolkit/show-facts.mjs c7.p1` | Shows the saved facts. |

The reference solution is in `reference/`. Look at it only after you have tried. `TFC_REFERENCE=1 node challenges/challenge-7-a-module/part-1-build-and-call/run.mjs` runs it.

## What you should see

On the starter, the run stops at the first fault. The ladder:

| You see | What it means | Where to look |
|---|---|---|
| `Error: Module is incompatible with count, for_each, and depends_on` at `init` | The module configures its own provider. | `modules/app-container/main.tf`, the top |
| `Did you intend to use kreuzwerker/docker?` at `init` | The module never said which Docker provider it needs, so Terraform looked for `hashicorp/docker`. | a new file in the module: `versions.tf` |
| `Conflict. The container name "/tfc-c7-app" is already in use` at `apply` | Two copies, one name. The plan could not see this: it is Docker's rule, not Terraform's. | the `name` argument of the container |
| After `apply`: the `container` output holds about 70 attributes and the fake token | The module outputs the whole resource. | `modules/app-container/outputs.tf` |
| The two bad inputs are accepted as `Plan: ...` | The module has no `validation` blocks. | `modules/app-container/variables.tf` |

The reference run ends with the three outputs `container_name`, `ip_address` and `network_name`, two `Error: Invalid value for variable` messages for the bad inputs, a second plan with no changes, and a destroy of five resources. It also shows the first two faults on purpose, on a copy of the finished module. Everything is in [results.md](results.md). IDs and addresses differ on your machine.

One more thing the run may show you: the first version of a container with `memory` set and no `memory_swap` makes every later plan say `memory_swap = 128 -> null`. Docker adds swap on its own and the provider reads it back. The module sets `memory_swap` to the same number as `memory`, which means no swap and no difference.

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c7.p1.init_ok` | Exit code of `terraform init`. |
| `c7.p1.plan_add_count` | The `N to add` in the first plan. 5 means one image, two networks and two containers. |
| `c7.p1.apply_ok`, `c7.p1.apply_added_count` | Exit code and the `N added` of `terraform apply`. |
| `c7.p1.module_instances_count` | Child modules in `terraform show -json`. 2 means `dev` and `prod`. |
| `c7.p1.output_keys_count` | Number of keys the module hands to the caller for `dev` in `terraform output -json apps`. |
| `c7.p1.output_leaks_token` | True when the fake token text appears anywhere in that output. |
| `c7.p1.environment_validation_rejects`, `c7.p1.memory_validation_rejects` | True when the plan with the bad input failed with the validation message. |
| `c7.p1.second_plan_changes_count` | Add, change and destroy of a plan right after `apply`. |
| `c7.p1.destroyed_count`, `c7.p1.leftover_count` | The `N destroyed` of `terraform destroy`, and the Docker objects still labelled `tfc.challenge=7`. |
| `c7.p1.demo_provider_block_error`, `c7.p1.demo_missing_requirement_error` | The first line of the two errors shown on a copy of the finished module (reference runs only). |

## What is different on your platform

- **Linux and WSL2:** the same. The toolkit passes your user and the Docker group to the container.
- **Docker Desktop (Windows, macOS):** the same output. The first container start can take a few seconds longer.
- **Codespace:** the same. `init` downloads the provider from the registry; allow a minute.
- **Local binary and container:** the toolkit runs `hashicorp/terraform:1.17.1` unless a local Terraform 1.17 or newer is on your PATH. Output is the same apart from the `Installed kreuzwerker/docker` line, which says `Using previously-installed` when the plugin cache already has the provider.

## Stuck?

- `terraform init` says `text file busy`: another run was writing the plugin cache at the same moment. `run.mjs` retries; run it again.
- The run stopped halfway and containers are left over: `node toolkit/cleanup.mjs 7`.
- `Inconsistent dependency lock file`: delete nothing; run `run.mjs` again, it builds a fresh `work/` folder.
- The test still fails after you fixed the module: run `run.mjs` first. The test reads the numbers of the last run.
