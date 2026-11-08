# Challenge 12, part 1: adopt a stack that was built by hand

**Time:** about 45 minutes. **Download:** none (the images `nginx:1.27-alpine` and `alpine:3.23` and the Docker provider come from earlier challenges; the first `init` fetches the provider if it is not cached). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A colleague built the test stack by hand with the `docker` command: one network and two containers. It works. Nobody wrote it down. Now you are asked to put it under Terraform, and you are told "just import it".

It sounds like a small job. Import the three objects, run `terraform apply`, done. Then you read the plan, and it says two containers will be **destroyed and created again**. If those had been databases, this would be the day you learn what "import" does not do.

## The idea

**Import** means: tell Terraform that an object which already exists is the one a resource block describes. Terraform writes the object into its state. It does not create anything. It does not change anything on its own.

Two things must exist before an import can work:

1. A `resource` block that describes the object (the **configuration**).
2. An `import` block that links the block to the real object: `to` is the address in your code, `id` is the name the provider uses for the real object.

```hcl
import {
  to = docker_container.web
  id = var.web_id
}
```

The `import` block (not the older `terraform import` command) shows up in `plan`, so you can read what it will do before it does it. It needs Terraform 1.5 or newer. It is also in OpenTofu.

**The id is not always the name.** For a Docker network the id is its name. For a Docker container it is the long container id that `docker inspect` prints. Step 3 shows the error you get when you use the name.

**Generated configuration.** Writing the resource block by hand for a container with 50 arguments is slow, so Terraform can write a draft: `terraform plan -generate-config-out=generated.tf`. The feature is marked experimental. Treat the file as a draft that you read, clean and move into your own files. Step 4 and 5 show why.

**The plan is the test.** After the import, the plan must say `0 to add` and `0 to destroy`. If the configuration differs from the real object in an argument the provider cannot change in place, Terraform plans a **replacement**: destroy, then create. The plan marks the cause with `# forces replacement`.

## What is in this folder

| File | What it is |
|---|---|
| `main.tf` | The provider and two variables, `web_id` and `cache_id`. `run.mjs` fills them with the ids of the containers it builds. |
| `network.tf` | The network. Done for you. |
| `containers.tf` | **Fault planted.** Two container blocks written the way a person writes them from the `docker` command. They are not safe to import. |
| `imports.tf` | **Blank to fill.** Only the network is imported. |
| `faults/containers.tf` | An untouched copy of the faulty `containers.tf`. The run uses it for the "before" plan. Do not edit it. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-12-adopt-and-refactor/part-1-import-blocks/run.mjs` | Builds the three objects by hand, tries the wrong ways, then plans your files. It stops before `apply` when your plan would destroy or add anything. About 2 minutes. |
| 2 | `node --test challenges/challenge-12-adopt-and-refactor/part-1-import-blocks/test.mjs` | Fails on purpose. Each failure says what to change. |
| 3 | Edit `imports.tf` | Add the two container imports. The ids are `var.web_id` and `var.cache_id`. |
| 4 | Run step 1 again | The plan still destroys. Read the lines that end with `# forces replacement`. |
| 5 | Edit `containers.tf` | Remove what forces the replacement. Hints are in "What you should see". |
| 6 | Run step 1 again, then the test | The plan says `3 to import, 0 to add, 2 to change, 0 to destroy`. `run.mjs` applies it, shows that the containers kept their ids and start times, and plans again: `No changes.` |
| 7 | `node toolkit/show-facts.mjs c12.p1` | Shows the saved facts. |

`run.mjs` and the test build their own stack and remove it at the end (only objects labelled `tfc.challenge=12`). If a run stopped halfway: `node toolkit/cleanup.mjs 12`.

## What you should see

The recorded run is in [results.md](results.md). In short:

1. **A container id is not its name.** `id = "tfc-c12-web"` fails with `Error: Cannot import non-existent remote object`.
2. **The generated draft** is 146 lines for three objects, 41 of them set an argument to `null`. Its plan reads `Plan: 3 to import, 2 to add, 0 to change, 2 to destroy.` Both containers are replaced, because the draft leaves out `env` and the provider treats a changed `env` as a replacement. The draft is not wrong about what exists. It is incomplete about what the provider needs.
3. **The naive configuration** is worse: `labels`, `networks_advanced` and the missing `env` each force a replacement (8 lines end with `# forces replacement`). The provider does not read container labels or the `networks_advanced` block back during an import, so the state has nothing to compare with.
4. **Your cleaned files** plan as `3 to import, 0 to add, 2 to change, 0 to destroy`. The two changes are the provider filling in arguments that exist only in its own state (`attach`, `logs`, `must_run`, `start`, `wait`). They never reach Docker. After the apply the containers have the same id and the same `StartedAt` as before, and the next plan says `No changes.`

What to change in `containers.tf`, in the order the plan will tell you: set `env = []`; describe the network with `network_mode = "tfc-c12-net"` instead of a `networks_advanced` block; leave out the `labels` block (the containers keep the labels they have; Terraform simply does not manage them).

![Objects the plan would destroy while adopting two containers](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c12.p1.import_by_name_error` | The error title of `terraform plan` when a container import uses its name. |
| `c12.p1.generated_lines_count`, `c12.p1.generated_null_arguments_count` | Non-empty lines of `generated.tf`, and how many of them end in `= null`. |
| `c12.p1.draft_plan_import_count`, `_add_count`, `_destroy_count` | The `Plan:` line for the untouched generated draft. |
| `c12.p1.naive_plan_add_count`, `_destroy_count`, `c12.p1.naive_forces_replacement_count` | The `Plan:` line for `faults/containers.tf`, and the number of lines ending in `# forces replacement`. |
| `c12.p1.plan_import_count`, `_add_count`, `_change_count`, `_destroy_count` | The `Plan:` line for your files. |
| `c12.p1.apply_imported_count`, `_added_count`, `_changed_count`, `_destroyed_count` | The `Apply complete!` line. |
| `c12.p1.container_ids_kept_count`, `c12.p1.container_restarts_count` | `docker inspect` before and after the apply: how many of the two containers kept their id, and how many have a new start time. |
| `c12.p1.second_plan_no_changes`, `c12.p1.state_resources_count` | The plan after the apply, and `terraform state list`. |

## Platform box

- **Linux and WSL2:** the same output.
- **Docker Desktop (Windows, macOS):** the same output. Terraform runs inside the pinned container (1.17.1) and reaches Docker through the mounted socket. Gateway addresses and ids differ between machines; the counts do not.
- **Codespace:** the same as Linux.
- **A local Terraform binary of 1.17 or newer** gives the same output. Terraform 1.5 is the oldest version that has `import` blocks and `-generate-config-out`.

Related: part 2 moves resources between addresses, part 3 stops managing a resource without destroying it.
