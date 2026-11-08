# Challenge 12, part 2: rename and move without destroying

**Time:** about 40 minutes. **Download:** none (same images and provider as part 1). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Someone tidies the code. They rename `docker_container.web` to `docker_container.frontend` and move all three resources into a module. The code looks better. The pull request has 40 changed lines and a green CI run.

Then somebody runs `terraform plan` and reads: `Plan: 3 to add, 0 to change, 3 to destroy.` The containers did not change at all. Only their names in the code did.

## The idea

Terraform keeps a **state**: a list of "this address in the code is that real object". The address is the resource type plus its name, plus the module path. When you rename a resource or move it into a module, the address changes. Terraform compares the new code with the old state, finds addresses it does not know, finds state entries the code no longer mentions, and plans the only thing it can: destroy the old ones, create the new ones.

A **`moved` block** tells Terraform "this old address is that new address":

```hcl
moved {
  from = docker_container.web
  to   = module.app.docker_container.frontend
}
```

On the next `apply`, Terraform renames the entry in the state. The real object is not touched. The plan shows it as `has moved to`, so you can check before you apply.

Things to know:

- `moved` needs Terraform 1.1 or newer (OpenTofu has it too). It works inside a module and across modules.
- A move changes the state only. It cannot change what the object is (a different `name` argument is a different change).
- Keep the `moved` blocks for a while. **Removing a moved block is a breaking change for every state that has not applied it yet**: a teammate, another environment, a pipeline. Step 8 of the run shows this.
- `terraform state mv` does the same job from the command line, once, with no record in the code. A `moved` block is code review friendly and works for every state that uses the code.

## What is in this folder

| File | What it is |
|---|---|
| `before/main.tf` | The OLD code: three resources at the top level. `run.mjs` and the test apply it first, so a real stack exists. Do not edit. |
| `main.tf`, `modules/app/main.tf` | The REFACTORED code: a module with new names. Done for you. |
| `moves.tf` | **Blank to fill.** The first `moved` block is shown as a comment. Write all three. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-12-adopt-and-refactor/part-2-moved-blocks/run.mjs` | Applies the old code, then plans the new code without moved blocks (the destructive plan) and with yours. It stops before the second `apply` if your plan would add or destroy anything. About 2 minutes. |
| 2 | `node --test challenges/challenge-12-adopt-and-refactor/part-2-moved-blocks/test.mjs` | Fails on purpose. Each failure says what to change. |
| 3 | Edit `moves.tf` | One `moved` block per resource. The new names are in `modules/app/main.tf`. Remember the `module.app.` prefix in `to`. |
| 4 | Run step 1 again, then the test | The plan says `0 to add, 0 to change, 0 to destroy` and shows three `has moved to` lines. After the apply, the containers have the same ids and start times. |
| 5 | `node toolkit/show-facts.mjs c12.p2` | Shows the saved facts. |

If a run stopped halfway: `node toolkit/cleanup.mjs 12`.

## What you should see

The recorded run is in [results.md](results.md). In short:

1. **No moved blocks:** `Plan: 3 to add, 0 to change, 3 to destroy.` Each destroy says `because docker_container.web is not in configuration`.
2. **With your moved blocks:** `Plan: 0 to add, 0 to change, 0 to destroy.` and three lines like `docker_container.web has moved to module.app.docker_container.frontend`.
3. **After the apply:** `Apply complete! Resources: 0 added, 0 changed, 0 destroyed.` The `state list` shows `module.app.docker_network.main`, `module.app.docker_container.frontend` and `module.app.docker_container.backend`. Ids and `StartedAt` of both containers are the same as before.
4. **Taking the moved blocks away** after your own apply still says `No changes.` Your state has the new addresses.
5. **A teammate with the old state** and the new code without moved blocks sees the destructive plan again (`3 to add, 3 to destroy`). The run lets the teammate apply it. Terraform destroys both containers and the network, and then the create fails with `network with name tfc-c12-net already exists`, because the new network started to create while the old one was still there. The stack is gone and the state is half old, half new. This is the damage a single missing block does.

![Objects the plan would destroy after the refactor](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c12.p2.no_moved_plan_add_count`, `c12.p2.no_moved_plan_destroy_count` | The `Plan:` line with `moves.tf` set aside. |
| `c12.p2.plan_add_count`, `_change_count`, `_destroy_count`, `c12.p2.plan_moved_count` | The `Plan:` line with your `moves.tf`, and the number of `has moved to` or `moved from` lines. |
| `c12.p2.apply_added_count`, `_changed_count`, `_destroyed_count` | The `Apply complete!` line. |
| `c12.p2.container_ids_kept_count`, `c12.p2.container_restarts_count` | `docker inspect` before and after: ids kept, and containers with a new start time. |
| `c12.p2.second_plan_no_changes`, `c12.p2.state_module_resources_count` | The plan after the apply, and the `module.app.` lines of `state list`. |
| `c12.p2.plan_without_moves_after_apply_no_changes` | The plan after you take `moves.tf` away, on the same state. |
| `c12.p2.teammate_plan_add_count`, `_destroy_count` | The plan of a copy that has the old state and no moved blocks. |
| `c12.p2.teammate_apply_containers_left_count`, `c12.p2.teammate_apply_error` | Containers still running after the teammate's apply, and the error it ended with. |

## Platform box

- **Linux and WSL2, Docker Desktop, Codespace:** the same output. Ids and times differ; the counts and the messages do not.
- **A local Terraform binary of 1.17 or newer** gives the same output. The teammate's apply races a create against a destroy, so the order of the lines can differ from run to run; the error and the end state did not in the recorded runs.

Related: part 1 adopts objects with `import`, part 3 stops managing an object without destroying it.
