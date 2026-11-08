# Challenge 4, part 2: the graph and the order

**Time:** about 35 minutes. **Download:** the `hashicorp/time` and `hashicorp/local` providers (small; the toolkit's plugin cache keeps them after the first run). **Docker:** not used in this part. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A release script creates the database, runs the migrations and loads the seed data. The plan is green. The apply is green. And the migrations ran before the database was ready, so they hit a database that was not there yet, or an old one. Nothing in the output said so.

Terraform builds things in an order it works out for itself. When you leave a connection out, Terraform does not guess. It does what is fastest. This part shows you the order Terraform works out, and what happens when you leave a link out.

## The idea

Terraform keeps a **dependency graph**: a list of "A needs B" links between the objects in your configuration. B is built first. Two objects with no path between them may be built at the same time (up to 10 at once by default; `-parallelism=N` changes that).

Links come from two places:

- **Implicit.** One object uses a value from another: `terraform_data.migrate.id` inside `seed`. Terraform sees the reference and adds the link for free. Use this whenever you can.
- **Explicit.** `depends_on = [...]`. You add the link yourself. Use it only when the second object needs the first one to be *finished* but uses no value from it (migrations need the database to be ready; a data source must read after a file is written).

`terraform graph` prints the graph in a text format called DOT. In Terraform 1.17 it prints one line per link, `"seed" -> "migrate"`, meaning "seed needs migrate". `run.mjs` parses those lines with plain Node and prints them as `seed needs migrate`.

Two more things you will see:

- A **cycle** (A needs B and B needs A) has no valid order. Terraform stops and names the objects.
- **Destroy runs the graph backwards**: whatever needs something is destroyed before the thing it needs.

## The faults in the starter

| File | Fault |
|---|---|
| `ordering/main.tf` | `migrate` must run after `time_sleep.database_ready` (a 2 second stand-in for a database that takes time to become ready) but nothing says so. |
| `reads/main.tf` | A `data "local_file"` reads a file that a `local_file` resource writes. Nothing links them, so Terraform reads the file while planning, before it exists. |

`faults/` holds untouched copies of both. The run uses them for the "before" numbers. Do not edit `faults/`. `cycle/` is a third, finished example for one step. Do not edit it either.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-4-lock-file-and-graph/part-2-the-graph-and-order/test.mjs` | Fails on purpose. Each failure names the file and the fix. |
| 2 | Edit `ordering/main.tf` and `reads/main.tf` | Read the comments that start with `FIX`. |
| 3 | `node challenges/challenge-4-lock-file-and-graph/part-2-the-graph-and-order/run.mjs` | A cycle, the originals failing, your versions working, `destroy` backwards. About 1 minute. |
| 4 | `node --test challenges/challenge-4-lock-file-and-graph/part-2-the-graph-and-order/test.mjs` | Passes when both fixes are in and the run was recorded. |
| 5 | `node toolkit/show-facts.mjs c4.p2` | Shows the saved numbers. |

Add `--reference` to `run.mjs`, or set `TFC_REFERENCE=1`, to run the solution in `reference/` instead of your files.

## What you should see

1. **A cycle.** `terraform validate` in `cycle/` fails and names both objects: `Error: Cycle:` followed by `terraform_data.a` and `terraform_data.b`.
2. **The original ordering.** The graph has one link, `seed needs migrate`. The apply (default parallelism) prints `migrate: Creation complete` *before* `time_sleep.database_ready: Creation complete after 2s`. No error. The migrations ran too early.
3. **Your ordering.** The graph has two links. The apply (with `-parallelism=1`, so the lines come in one readable order) finishes the database, then migrate, then seed. The destroy removes seed, then migrate, then the database.
4. **The early read.** The original `reads/` fails at the plan:

```text
Error: Read local file data source error
...
Original Error: open ./out/settings.txt: no such file or directory
```

   With `depends_on`, the plan says `data.local_file.settings will be read during apply`, and the apply reads the file after it is written.

The full recorded run is in [results.md](results.md).

![Edges in the graph](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c4.p2.cycle_validate_exit_code`, `c4.p2.cycle_error_line` | `terraform validate` in `cycle/`, and its `Cycle:` line with the object names joined on one line. |
| `c4.p2.fault_edge_count`, `c4.p2.edge_count` | Lines of `terraform graph` output that look like `"A" -> "B"`, for the original and for yours. |
| `c4.p2.fault_migrate_needs_database_edge`, `c4.p2.migrate_needs_database_edge` | Whether one of those links is `terraform_data.migrate -> time_sleep.database_ready`. |
| `c4.p2.fault_migrate_before_database` | In the original apply, whether the `migrate` completion line comes before the `database_ready` completion line. |
| `c4.p2.migrate_after_database` | In your apply, whether `migrate: Creating...` comes after `database_ready: Creation complete`. |
| `c4.p2.edges_respected` | For every link "A needs B" in your graph, `B` completed before `A` started, in the apply output. |
| `c4.p2.destroy_reverses_order` | For every link, `A` was destroyed before `B` started to be destroyed. |
| `c4.p2.reads_fault_plan_exit_code`, `c4.p2.reads_fault_error_line` | `terraform plan` on the original `reads/`: exit code (1) and the `Original Error:` text. |
| `c4.p2.reads_plan_exit_code`, `c4.p2.reads_apply_exit_code`, `c4.p2.reads_value_read` | `plan` and `apply` on your `reads/`, and whether the output holds the settings that were written. |

## What is different on your machine

- **Linux and WSL2, Docker Desktop, Codespace:** the same lines. By default the toolkit runs Terraform 1.17.1 in the official container; a local binary of 1.17 or newer prints the same.
- **The original `ordering/` apply** shows the order that happens on one machine on one run. Terraform walks independent objects at the same time, so the order of the lines between *independent* objects may differ on your machine. What does not change: migrate does not wait for the database.
- Random ids (`[id=...]`) differ on every run; the recorded ones are from the reference run.
- Older Terraform versions print `terraform graph` differently (many more nodes, such as `(expand)` and `provider[...]` entries). If your own binary is older than 1.17, use the container.

## Stuck?

- `Failed to install provider` or `no version is selected`: another run was writing the shared plugin cache. Run the command again. `run.mjs` retries by itself.
- Your fix does not show up: edit the files in this folder, not in `work/` (`run.mjs` deletes and recreates `work/` each time).
- Nothing is left in Docker by this part. To be sure: `node toolkit/cleanup.mjs 4`.
