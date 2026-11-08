# Challenge 12, part 3: stop managing a resource without destroying it

**Time:** about 40 minutes. **Download:** none (same images and provider as parts 1 and 2). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

The cache container now belongs to another team. Your Terraform code should stop mentioning it. Someone deletes the `docker_container.cache` block, opens a pull request, and the plan says `Plan: 0 to add, 0 to change, 1 to destroy.`

Nobody asked for a destroy. They asked Terraform to forget. Terraform has only ever known one meaning for "this block is gone": the object should be gone too.

## The idea

When a resource block disappears from the code and the state still has it, Terraform plans a **destroy**. To say "forget it, keep it" you have two tools.

**A `removed` block** (in the code, reviewed in the pull request, shown in the plan):

```hcl
removed {
  from = docker_container.cache

  lifecycle {
    destroy = false
  }
}
```

`from` is the address of the resource that is gone from the code. The `lifecycle` block with `destroy = false` is the part that says "do not destroy the real object". Without it, a `removed` block still destroys. The plan then says `will no longer be managed by Terraform, but will not be destroyed` and ends with a warning that the object is no longer tracked. To manage it again later you import it (part 1). `removed` needs Terraform 1.7 or newer.

**`terraform state rm ADDRESS`** (a command, immediate, with no plan and no trace in the code):

```sh
terraform state rm docker_container.web
```

It deletes the entry from the state now. If the resource block is still in the code, the next plan wants to create the object again, and the apply fails because the name is taken. With `state rm` you change the code in the same pull request, and you need to tell everybody who shares the state.

Rule of thumb: use `removed` when the change goes through a pull request, use `state rm` for a one-off repair you can explain afterwards. Both leave the real object alone.

## What is in this folder

| File | What it is |
|---|---|
| `before/main.tf` | The OLD code: network, web and cache. `run.mjs` and the test apply it first, so the stack exists and all three objects are in the state. Do not edit. |
| `main.tf` | The code today: the cache block is already deleted. |
| `removed.tf` | **Blank to fill.** Write the removed block. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-12-adopt-and-refactor/part-3-removed-blocks/run.mjs` | Applies the old code, plans the new code three ways (nothing, a bare removed block, yours), and stops before the apply when your plan destroys anything. About 2 minutes. |
| 2 | `node --test challenges/challenge-12-adopt-and-refactor/part-3-removed-blocks/test.mjs` | Fails on purpose. Each failure says what to change. |
| 3 | Edit `removed.tf` | One `removed` block for `docker_container.cache`, with `lifecycle { destroy = false }`. |
| 4 | Run step 1 again, then the test | The plan destroys nothing. After the apply the cache container still runs, with the same id and start time, and the state no longer lists it. Then `run.mjs` tries `state rm` on the web container and shows the trap. |
| 5 | `node toolkit/show-facts.mjs c12.p3` | Shows the saved facts. |

If a run stopped halfway: `node toolkit/cleanup.mjs 12`.

## What you should see

The recorded run is in [results.md](results.md). In short:

1. **Block deleted, nothing else:** `Plan: 0 to add, 0 to change, 1 to destroy.` with `because docker_container.cache is not in configuration`.
2. **`removed { from = ... }` with no lifecycle part:** the same destroy.
3. **With `destroy = false`:** `Plan: 0 to add, 0 to change, 0 to destroy.`, the line `docker_container.cache will no longer be managed by Terraform, but will not be destroyed` and `Warning: Some objects will no longer be managed by Terraform`.
4. **After the apply:** `terraform state list` shows the network and the web container only; `docker ps` still shows the cache container; a second plan says `No changes.`
5. **`state rm` on the web container with its block still in the code:** `Removed docker_container.web`, then `Plan: 1 to add`. The apply fails: `The container name "/tfc-c12-web" is already in use`. Delete the block as well and the plan is clean again.

![Objects the plan would destroy after the cache block was deleted](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c12.p3.no_removed_plan_destroy_count` | The `Plan:` line with the cache block deleted and `removed.tf` set aside. |
| `c12.p3.removed_without_lifecycle_plan_destroy_count` | The `Plan:` line with `removed { from = docker_container.cache }` only. |
| `c12.p3.plan_add_count`, `_change_count`, `_destroy_count`, `c12.p3.plan_forgotten_count` | The `Plan:` line with your `removed.tf`, and how many objects the plan says will no longer be managed. |
| `c12.p3.apply_destroyed_count`, `c12.p3.cache_still_running`, `c12.p3.cache_same_id`, `c12.p3.cache_in_state`, `c12.p3.state_resources_count` | The apply, then `docker inspect` and `terraform state list`. |
| `c12.p3.second_plan_no_changes` | The plan after the apply. |
| `c12.p3.state_rm_plan_add_count`, `c12.p3.state_rm_apply_error`, `c12.p3.state_rm_apply_ok` | The plan and the apply after `terraform state rm docker_container.web` with the block still in the code. |
| `c12.p3.after_state_rm_plan_no_changes`, `c12.p3.containers_running_at_end_count` | The plan after the web block is deleted too, and the containers still running. |

## Platform box

- **Linux and WSL2, Docker Desktop, Codespace:** the same output. Ids differ; the counts and the messages do not.
- **A local Terraform binary of 1.17 or newer** gives the same output. `removed` blocks need Terraform 1.7 or newer (OpenTofu 1.7 or newer).

Related: part 1 adopts objects with `import` (the way back for a forgotten object), part 2 moves objects between addresses.
