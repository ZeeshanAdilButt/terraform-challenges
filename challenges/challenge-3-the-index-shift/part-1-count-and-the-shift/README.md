# Challenge 3, part 1: count and the index shift

**Time:** about 60 minutes. **Download:** the `local` provider (a few MB), once. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A list of five environment names drives five resources. Someone deletes the third name, because that environment was retired. The pull request is one line removed. The plan says `Plan: 2 to add, 0 to change, 3 to destroy.` Nobody asked for three destroys and nobody can say which three, or why. If the resources are databases, the review is the last defence.

This part makes that plan happen on five harmless text files, so you can read it carefully and decide, before it matters, why Terraform behaves like this and what to do instead.

## The idea

Terraform gives every resource instance an **address**: a name by which state remembers it. With `count`, resources made from one block get the address `type.name[0]`, `type.name[1]`, and so on. The number in the brackets is the **index**: the position in the list.

```hcl
resource "local_file" "item" {
  count    = length(var.names)
  filename = "out/item-${count.index}.txt"
  content  = "hello ${var.names[count.index]}\n"
}
```

Here `local_file.item[2]` is "the file for position 2". Which name sits at position 2 is only a *value* inside it. When you remove a name from the middle of the list, everything after it moves one position to the left. Position 2 now holds a different name. Terraform compares the old `item[2]` (which said `hello charlie`) with the new `item[2]` (which should say `hello delta`), sees a different `content`, and because the provider cannot change a file's content in place, it **replaces** the file. The same happens to every position after the gap. At the end, the last position has no name, so it is **destroyed**.

The edit that removes one file asks Terraform to rewrite everything behind it.

You count it like this, for a list of N names where you remove the name at position p (counting from 0): positions before p keep their address and their content, so they are untouched. Positions p to N-2 each now hold a different name, so each is replaced: one add and one destroy. Position N-1 is destroyed. How many adds, changes and destroys is for you to predict.

## What you do

`main.tf` has one fault: `count = 5` is written by hand. Fix it first. Then open `predictions.json`. `run.mjs` will start from five names (`alpha`, `bravo`, `charlie`, `delta`, `echo`), and for each of three edits it runs `terraform plan` (never applying):

| Edit | The change |
|---|---|
| `remove_first` | remove `alpha`, the first name |
| `remove_middle` | remove `charlie`, the middle name |
| `remove_last` | remove `echo`, the last name |

Write the three numbers you expect on the `Plan:` line (`add`, `change`, `destroy`) for each. Decide before you run. `run.mjs` also plans two edits you do not predict (reverse the order, insert at the front) and applies the middle removal for real.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-3-the-index-shift/part-1-count-and-the-shift/test.mjs` | Fails on purpose: no facts yet. |
| 2 | Edit `challenges/challenge-3-the-index-shift/part-1-count-and-the-shift/predictions.json` | Nine numbers. |
| 3 | `node challenges/challenge-3-the-index-shift/part-1-count-and-the-shift/run.mjs` | With `count = 5` the plans for four names fail: read the error. About 2 minutes. |
| 4 | Edit `challenges/challenge-3-the-index-shift/part-1-count-and-the-shift/main.tf` | Make `count` follow the length of `var.names`. |
| 5 | `node challenges/challenge-3-the-index-shift/part-1-count-and-the-shift/run.mjs` | Run again. Compare each real plan with your prediction. |
| 6 | `node --test challenges/challenge-3-the-index-shift/part-1-count-and-the-shift/test.mjs` | Repeat steps 2 to 6 until it passes. |
| 7 | `node toolkit/show-facts.mjs c3.p1` | Shows the saved facts. |

`run.mjs` copies your files to a `work/` folder and runs Terraform there. The files it creates are in `work/out/`.

## What you should see

In the recorded reference run, from five names:

| Edit | Plan line | What moved |
|---|---|---|
| remove the first | `Plan: 4 to add, 0 to change, 5 to destroy.` | All four remaining names moved left: four replaced, plus the last position destroyed. |
| remove the middle | `Plan: 2 to add, 0 to change, 3 to destroy.` | Two names moved: two replaced, plus the last position destroyed. |
| remove the last | `Plan: 0 to add, 0 to change, 1 to destroy.` | Nothing moved. |
| reverse the order (shown, not predicted) | `Plan: 4 to add, 0 to change, 4 to destroy.` | Only the centre name stays where it was. |
| insert at the front (shown, not predicted) | `Plan: 6 to add, 0 to change, 5 to destroy.` | All five replaced, plus one new position. |

With the hand-written `count = 5`, the plan for four names fails with an index error from `var.names[4]`.

The full recorded run is in [results.md](results.md). The chart shows how many resources each edit destroys.

![Resources destroyed by one edit](chart.svg)

Part 2 does the same five edits with `for_each`, where the answer is one destroy at most, and often none.

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c3.p1.baseline_added_count` | `Apply complete!` of the five-name apply (5). |
| `c3.p1.<edit>_plan_ok` | The plan for that edit printed a `Plan:` line (false if it failed with an error). `<edit>` is `remove_first`, `remove_middle`, `remove_last`, `reverse` or `insert_front`. |
| `c3.p1.<edit>_add_count`, `_change_count`, `_destroy_count` | The numbers on that plan's `Plan:` line. |
| `c3.p1.<edit>_touched_count` | Resource addresses that appear in that plan. |
| `c3.p1.<edit>_prediction_matches` | Your three numbers equal the real ones (the first three edits only). |
| `c3.p1.predictions_correct_count` | How many of the three match. Must be 3. |
| `c3.p1.middle_apply_added_count`, `middle_apply_destroyed_count` | The `Apply complete!` line of the real middle removal (2 added, 3 destroyed). |
| `c3.p1.files_after_middle_apply_count` | Files left in `work/out/` after it (4). |

## Platform box

| Where you run | What to know |
|---|---|
| Linux and WSL2 | As written. |
| Docker Desktop | As written. Each `terraform` call starts a container. |
| GitHub Codespace | As written. |
| Local Terraform, not the container | Same plans. File permissions on the created files follow your system. |

## Stuck?

- The plans fail with `Invalid index`: `count` is still a fixed number. The list has four names, and `var.names[4]` does not exist.
- Your numbers keep missing: write the list for each case, with positions. Compare it with the old list position by position. A position is replaced when its name differs; it is destroyed when it no longer exists.
- Files left in `work/out/` after you stop: delete the `work/` folder. `run.mjs` makes a fresh one.
