# Challenge 1, part 2: predict three plans

**Time:** about 60 minutes. **Download:** none beyond part 1 (the same providers and `alpine:3.23`). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A reviewer opens a pull request that changes one line in a Terraform file: a number, a name, a tag. The diff is one line. The plan underneath says `Plan: 2 to add, 0 to change, 2 to destroy.` Nobody on the team can say, before running it, which resources it will touch or why a one-line edit destroys two things.

Predicting the plan before you run it is the skill that separates "I applied it and it worked" from "I knew what it would do". This part trains it, with a score you cannot argue with: the real plan.

## The idea

When a configuration changes, Terraform compares each resource's new settings with what state remembers. For every resource it picks one action:

| Action | Symbol | Plan line | When |
|---|---|---|---|
| nothing | | (not listed) | Nothing changed. |
| update in place | `~` | `will be updated in-place` | The provider can change the setting on the live object. Same object afterwards. |
| replace | `-/+` | `must be replaced` | The provider cannot change that setting on a live object. Terraform destroys the object and creates a new one. The setting is marked `# forces replacement`. |
| create / destroy | `+` / `-` | `will be created` / `will be destroyed` | The resource is new or gone from the configuration. |

Which setting forces replacement is not a Terraform rule. **The provider decides, setting by setting.** The docs of each resource say so, and so does the plan: look for `# forces replacement`.

A replacement counts as one add and one destroy. And replacements spread: if resource B uses a value of resource A, and A is replaced, B's input becomes "known after apply", so B changes too.

## What you do

`main.tf` is the baseline from part 1 (already fixed, do not edit it). `run.mjs` will apply it, then change **one thing at a time** and run `terraform plan` on each change without applying it:

| Edit | The change |
|---|---|
| 1 | The container's `restart` policy goes from `"no"` to `"on-failure"`. |
| 2 | The greeting text in `local_file.greeting` goes from `hello from ...` to `hi from ...`. |
| 3 | `random_pet.name` goes from `length = 2` to `length = 3`. |

Open `predictions.json`. For each edit write the three numbers you expect on the `Plan:` line (`add`, `change`, `destroy`) and the list of resource addresses you expect to appear in the plan (`touches`). Decide **before** you run anything. Then run, compare, and learn from every miss.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-1-the-loop/part-2-predict-three-plans/test.mjs` | Fails on purpose: no facts, and the predictions are blank. |
| 2 | Edit `challenges/challenge-1-the-loop/part-2-predict-three-plans/predictions.json` | Fill in all nine numbers and three lists. |
| 3 | `node challenges/challenge-1-the-loop/part-2-predict-three-plans/run.mjs` | Applies the baseline, plans the three edits, scores your predictions, then applies two edits for real. About 2 minutes. |
| 4 | Read the three plan summaries and your result under each | For a miss, find the `# forces replacement` line or the resource that uses a changed value. |
| 5 | `node --test challenges/challenge-1-the-loop/part-2-predict-three-plans/test.mjs` | Fix `predictions.json` until it passes. Each failure says which edit and what the real counts were. |
| 6 | `node toolkit/show-facts.mjs c1.p2` | Shows the saved facts. |

After your three predictions, `run.mjs` also applies edit 1 and a fourth edit (the container `command`) for real. It prints the container id before and after each. You see the difference between "update" and "replace" as a fact: the same id, or a new one.

## What you should see

The recorded reference run:

| Edit | Plan line | Why |
|---|---|---|
| 1 restart policy | `Plan: 0 to add, 1 to change, 0 to destroy.` | The container can change its restart policy while it runs. |
| 2 greeting text | `Plan: 1 to add, 0 to change, 1 to destroy.` | `content` of `local_file` is marked `# forces replacement`. |
| 3 pet length | `Plan: 2 to add, 0 to change, 2 to destroy.` | `length` forces the pet to be replaced; the file text uses the pet name, so the file is replaced as well. |

After edit 1 is applied the container id is unchanged. After the fourth edit (the command) the container id is new.

The full recorded run is in [results.md](results.md), and the chart below shows the destroys per plan.

![Resources destroyed by each plan](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c1.p2.baseline_added_count` | `Apply complete!` of the baseline (4). |
| `c1.p2.editN_add_count`, `editN_change_count`, `editN_destroy_count` | The `Plan:` line of the plan for edit N (N is 1, 2 or 3). |
| `c1.p2.editN_touched_count` | Number of `# address will be ...` or `must be ...` lines in that plan. |
| `c1.p2.editN_prediction_matches` | Your numbers and your address list equal the real ones. |
| `c1.p2.predictions_correct_count` | How many of the three match. Must be 3. |
| `c1.p2.update_apply_changed_count`, `update_keeps_container_id` | Applying edit 1: `1 changed`, and `docker inspect` gives the same container id. |
| `c1.p2.replace_apply_added_count`, `replace_apply_destroyed_count`, `replace_new_container_id` | Applying the fourth edit: `1 added, 1 destroyed`, and a different container id. |
| `c1.p2.edit4_destroy_count` | Destroys in the plan of the fourth edit (1). |
| `c1.p2.destroy_destroyed_count` | The final `terraform destroy` (4). |

## Platform box

| Where you run | What to know |
|---|---|
| Linux and WSL2 | As written. |
| Docker Desktop | As written. Each `plan` takes several seconds. |
| GitHub Codespace | As written. |
| Local Terraform, not the container | Same plan lines. |

## Stuck?

- `main.tf no longer contains ...`: you edited `main.tf`. Put it back (`git checkout` the file) and edit `predictions.json` only.
- A prediction keeps missing: search the plan for `# forces replacement`. The attribute named on that line is why the object is replaced. If the attribute is not on any line of the resource, look at what else changed: something it depends on.
- A container is left after a crash: `node toolkit/cleanup.mjs 1`.
