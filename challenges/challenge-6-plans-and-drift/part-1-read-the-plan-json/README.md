# Challenge 6, part 1: read the plan JSON

**Time:** about 40 minutes. **Download:** the `kreuzwerker/docker` provider (about 75 MB) and `hashicorp/local` (small), first run only. The containers use `nginx:1.27-alpine` and `alpine:3.23`, which you pulled in challenge 0. **Docker:** two labelled containers, `tfc-c6-web` and `tfc-c6-worker`. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A pull request changes six lines. The pipeline posts the plan. The last line says:

```text
Plan: 4 to add, 1 to change, 4 to destroy.
```

The reviewer sees "1 to change" and "4 to destroy", thinks "some clean-up", and approves. One of the four destroys is the web container. Three of the four "adds" are not new things at all: they are the same resources, destroyed and built again. The last line of a plan counts actions. It does not say which resources they belong to, or that a pair is one replacement.

Reviewing a plan means reading it per resource. A person can do that in the text. A script (a policy gate, a PR bot) has to do it from the JSON. This part has you write that script's core.

## The idea

`terraform plan -out=plan.tfplan` saves the plan. `terraform show -json plan.tfplan` prints it as JSON for programs. Under `resource_changes`, every resource has a `change` with a list called `actions`:

| `actions` | What it means | What a reviewer should think |
|---|---|---|
| `["create"]` | new | usually fine |
| `["update"]` | changed in place | read what changes |
| `["delete"]` | removed | is that on purpose? |
| `["delete","create"]` | **replace**: destroy the old one, then build a new one | data on it is gone; a server is gone for a while |
| `["create","delete"]` | **replace** with `create_before_destroy`: build first, then remove the old one | the same replacement, in the other order |
| `["no-op"]` | nothing | |
| `["read"]` | a data source is read | |

A bug that looks reasonable: test for `delete` first, then `create`. Every replacement then counts as a plain delete or a plain create, and the count of "replace" in your report is always zero.

Two more fields tell you *why*:

- `change.replace_paths` lists the attributes that forced the replacement, for example `[["image"], ["command"]]`. In the text plan these are the lines that end in `# forces replacement`.
- `action_reason` on the resource says why Terraform acts at all: `replace_because_cannot_update` (an attribute cannot change in place), `delete_because_no_resource_config` (you removed the block), `replace_by_request` (you passed `-replace`), and others.

## The files

| File | What it is |
|---|---|
| `before/main.tf` | What is deployed today. Do not edit. `run.mjs` applies it first. |
| `main.tf` | The pull request. Do not edit. It changes seven things, one of each kind. |
| `classify.mjs` | **Yours.** `classify(change)` returns `create`, `update`, `replace`, `delete`, `read` or `none`; `replaceReasons(change)` returns the attributes that forced a replacement. The starter has both faults. |
| `fixtures/changes.json` | The changes of the recorded plan, as `run.mjs` read them. The test uses it, so it runs without Docker. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-6-plans-and-drift/part-1-read-the-plan-json/test.mjs` | Fails on purpose. |
| 2 | Edit `classify.mjs` | Read the `FIX` comments. |
| 3 | `node --test challenges/challenge-6-plans-and-drift/part-1-read-the-plan-json/test.mjs` | Repeat until it passes. No Docker needed for this step. |
| 4 | `node challenges/challenge-6-plans-and-drift/part-1-read-the-plan-json/run.mjs` | Applies `before/main.tf`, plans `main.tf` (it never applies it), saves the plan, reads the JSON, runs your `classify.mjs`. About 1 to 2 minutes. |
| 5 | `node toolkit/show-facts.mjs c6.p1` | Shows the saved numbers. |

Add `--reference` to `run.mjs` or the test, or set `TFC_REFERENCE=1`, to use the solution in `reference/`.

## What you should see

The text plan for the pull request:

```text
  # docker_container.web must be replaced
  # docker_container.worker will be updated in-place
  # local_file.motd must be replaced
  # terraform_data.cbd must be replaced
  # terraform_data.newcomer will be created
  # terraform_data.old will be destroyed
Plan: 4 to add, 1 to change, 4 to destroy.
```

The JSON, one line per resource (actions, then `action_reason`):

```text
docker_container.web       ["delete","create"]  replace_because_cannot_update
docker_container.worker    ["update"]
local_file.motd            ["delete","create"]  replace_because_cannot_update
terraform_data.cbd         ["create","delete"]  replace_because_cannot_update
terraform_data.newcomer    ["create"]
terraform_data.old         ["delete"]           delete_because_no_resource_config
terraform_data.same        ["no-op"]
```

The truth, in words: 1 create, 1 update, **3 replacements**, 1 delete, 1 untouched. The attributes that forced the replacements: `image` and `command` for the web container, `content` for the file, `triggers_replace` for `cbd`. A second plan, with `-replace=terraform_data.same`, gives the same two-action list with the reason `replace_by_request`.

With the starter, your classifier reports all three replacements as plain `delete`, so a gate built on it would see 4 deletes where there are 3 replacements and 1 delete.

The full recorded run is in [results.md](results.md).

![What the pull request does, resource by resource](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c6.p1.plan_text_add_count`, `c6.p1.plan_text_change_count`, `c6.p1.plan_text_destroy_count` | The `Plan: N to add, N to change, N to destroy` line. |
| `c6.p1.resources_in_plan_count` | Entries under `resource_changes` in the plan JSON. |
| `c6.p1.web_actions`, `c6.p1.cbd_actions` | The `actions` list of those two resources. |
| `c6.p1.truth_create_count`, `c6.p1.truth_update_count`, `c6.p1.truth_replace_count`, `c6.p1.truth_delete_count`, `c6.p1.truth_none_count` | The correct classification of each resource, fixed in `run.mjs` from the design of `main.tf` (checked against the JSON). |
| `c6.p1.classify_correct_count`, `c6.p1.reasons_correct_count` | How many resources your `classify` and your `replaceReasons` got right. |
| `c6.p1.web_replace_reasons`, `c6.p1.motd_replace_reasons`, `c6.p1.web_action_reason` | `replace_paths` joined with `.`, and `action_reason`, of those resources. |
| `c6.p1.requested_replace_reason` | `action_reason` of `terraform_data.same` in the plan made with `-replace`. |

## What is different on your machine

- **Linux and WSL2, Docker Desktop, Codespace:** the same lines. By default the toolkit runs Terraform 1.17.1 from the pinned image and mounts the Docker socket (the one named exception in [SAFETY.md](../../../SAFETY.md)); a local binary of 1.17 or newer prints the same.
- The order of the `replace_paths` entries (`image, command`) is the order Terraform reports. Do not rely on it.
- Ids differ on every run.

## Stuck?

- `FIX 1` still fails: check both orders, `["delete","create"]` and `["create","delete"]`, before you look at a single action.
- `FIX 2`: each element of `replace_paths` is itself a list of steps (`["labels", 0, "value"]`); join the steps with `.`.
- Leftovers from a stopped run: `node toolkit/cleanup.mjs 6`.
- `Failed to install provider` or similar: another run was writing the shared plugin cache. `run.mjs` retries by itself.
