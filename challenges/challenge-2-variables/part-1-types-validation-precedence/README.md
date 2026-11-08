# Challenge 2, part 1: types, validation and precedence

**Time:** about 60 minutes. **Download:** none. This part uses no provider, so `init` has nothing to fetch. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A new teammate sets `replicas = 50` in a `terraform.tfvars` file because the dashboard looked quiet. Nothing stops them. The plan is long, the review is short, and forty containers start. A week later someone sets `TF_VAR_replicas=2` in the pipeline to fix it, and the next run still starts fifty. Nobody knows which of the two settings Terraform listened to.

Two questions, then: **how do you make a bad value fail early and say why?** (types and validation), and **when the same variable is set in several places, which one wins?** (precedence). Both can be settled with a test run, not a guess.

## The idea

An **input variable** is a named setting a configuration reads as `var.name`. You declare it in a `variable` block. Three parts of the declaration matter here:

| Part | What it does |
|---|---|
| `type` | The shape of the value: `string`, `number`, `bool`, `list(number)`, `map(string)`, `object({ cpu = number })`. Terraform **converts** text to the type when it can (`"3"` becomes `3`) and stops when it cannot (`"abc"` is not a number). |
| `default` | The value used when nobody sets one. A variable **without** a default is *required*: Terraform stops if it is not set. |
| `validation` | A `condition` that must be true, and an `error_message` for when it is not. The type says what a value *is*; validation says what it is *allowed to be*. |

A type cannot say "a whole number from 1 to 5" or "lowercase letters only". A validation block can.

**Precedence.** A value can arrive from seven places. Terraform documents an order, from the lowest to the highest. Where two places set the same variable, the higher one wins:

1. the `default` in the variable block
2. an environment variable named `TF_VAR_<name>`
3. `terraform.tfvars`
4. `terraform.tfvars.json`
5. files that end in `.auto.tfvars` (or `.auto.tfvars.json`), in alphabetical order
6. `-var-file=...` and `-var name=value` on the command line, **in the order written** (the last one wins)

You will not take that on trust. `run.mjs` sets the same variable in these places, two at a time, and asks `terraform console` which value it used.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-2-variables/part-1-types-validation-precedence/test.mjs` | Fails on purpose: no facts yet. |
| 2 | Edit `challenges/challenge-2-variables/part-1-types-validation-precedence/predictions.json` | For each of the seven duels, write which source you expect to win. Decide before you run. |
| 3 | `node challenges/challenge-2-variables/part-1-types-validation-precedence/run.mjs` | Shows types, a missing required variable, validation (none yet), type errors, your seven duels scored, and the whole ladder. About 2 minutes. |
| 4 | Edit `challenges/challenge-2-variables/part-1-types-validation-precedence/variables.tf` | Three fixes: `replicas` must be a `number`; add validation to `project` and to `replicas`. |
| 5 | `node challenges/challenge-2-variables/part-1-types-validation-precedence/run.mjs` | Run again. Now bad values stop the plan. |
| 6 | `node --test challenges/challenge-2-variables/part-1-types-validation-precedence/test.mjs` | Repeat steps 2 to 6 until it passes. |
| 7 | `node toolkit/show-facts.mjs c2.p1` | Shows the saved facts. |

`run.mjs` copies your files to a `work/` folder and runs Terraform there. It writes the `.tfvars` files it needs into `work/` and removes them again. Nothing is created: the configuration has only outputs.

## What you should see

After your fixes, in the recorded reference run:

- `type(var.replicas)` says `number`.
- With no value for `project`: `Error: No value for required variable`.
- `-var project=Bad_Name` stops with `Error: Invalid value for variable`, the line `var.project is "Bad_Name"`, your own message, and the location of the validation rule. `replicas=9` and `replicas=2.5` stop the same way. `project=daftar` with `replicas=3` passes.
- `-var replicas=3` works as the number 3 (`var.replicas + 1` is `4`). `-var replicas=abc` stops with `Error: Invalid value for input variable` and `a number is required`. This is a *type* error, not a validation error: the message is different on purpose.
- In the ladder, each source you add wins over everything before it, up to `-var`.
- Two things people get wrong: `terraform.tfvars` beats `TF_VAR_...` (the environment is *lower*, not higher), and `-var` does not always beat `-var-file`: whichever comes **last** on the command line wins.

The full recorded run is in [results.md](results.md).

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c2.p1.replicas_type_text` | `type(var.replicas)` in `terraform console`. Must be `number`. |
| `c2.p1.missing_required_rejected` | `terraform plan` with no value for `project` fails with `No value for required variable`. |
| `c2.p1.bad_name_rejected`, `replicas_too_high_rejected`, `replicas_fraction_rejected` | `terraform plan` exits non-zero with `Invalid value for variable` for `Bad_Name`, `9` and `2.5`. |
| `c2.p1.good_values_accepted` | `terraform plan -var project=daftar -var replicas=3` exits 0. |
| `c2.p1.string_converted_to_number` | `var.replicas + 1` is `4` when `replicas=3` is given as text. |
| `c2.p1.type_error_number_rejected`, `type_error_list_rejected` | `replicas=abc` and `ports=[80,"x"]` fail with `Invalid value for input variable`. |
| `c2.p1.duelN_..._winner_text` | The label `terraform console` printed for `var.greeting` in duel N. |
| `c2.p1.duels_correct_count` | How many of your seven predictions match. Must be 7. |
| `c2.p1.documented_order_holds` | Adding the sources one at a time, each new source won. |
| `c2.p1.precedence_order_text` | The winners of that ladder, joined by `<`. |

## Platform box

| Where you run | What to know |
|---|---|
| Linux and WSL2 | As written. |
| Docker Desktop | As written. Each `terraform` call starts a container, so the run takes a couple of minutes. |
| GitHub Codespace | As written. |
| Local Terraform, not the container | Same messages. The `This was checked by the validation rule at variables.tf:...` line contains your own file position. |

## Stuck?

- A duel keeps missing: the winner is the *last* source in the list above that sets the variable. For `-var` and `-var-file`, "last" means last on the command line.
- `replicas=9` is still accepted: the validation block goes *inside* `variable "replicas" { ... }`, and the condition must be true for good values.
- `project=daftar` is rejected: check the regular expression. `^[a-z0-9]{3,12}$` means 3 to 12 characters, each a lowercase letter or digit.
- A `.tfvars` file is left in `work/`: delete the `work/` folder; `run.mjs` makes a fresh one.
