# Challenge 6, part 3: sensitive values in plans

**Time:** about 30 minutes. **Download:** the `hashicorp/random` provider (small, first run only). **Docker:** only to run Terraform itself. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A teammate pastes a plan into the pull request so you can review it. The plan says `(sensitive value)` wherever a password would be, so everyone relaxes. Meanwhile the same plan, as a JSON file, is uploaded as a build artifact for a policy checker. Nobody reads that file. It holds the password in plain text.

`sensitive = true` is a label that hides a value in what Terraform *prints*. This part shows you every place the secret is still readable, and makes you predict them first.

## The idea

- A **sensitive** variable or output is hidden in the text that `plan`, `apply` and `output` print: you see `(sensitive value)` or `<sensitive>`.
- It is **not** hidden in files. The plan file, the plan as JSON, and the state file all hold the real value. The JSON has a flag (`after_sensitive`) so that tools reading it know the value was marked sensitive. The flag does not hide anything.
- A secret that Terraform makes itself (`random_password`) does not exist at plan time: the plan says it is *unknown*. After the apply it is in the state file in plain text.
- The label is added per attribute. If one attribute copies another (`terraform_data.output` copies `input`), the copy may not carry the label.
- Real protection comes from where these files live and who can read them, and in challenge 9 from keeping the secret out of the state in the first place.

## The files

| File | What it is |
|---|---|
| `main.tf` | One sensitive variable (`db_password`, a made-up demo value passed by `run.mjs`), one `random_password`, and two `terraform_data` resources that use them. Do not edit. |
| `predictions.json` | **Yours.** Nine questions, each `true` (the secret is readable there) or `false`. All `false` in the starter. |

The nine keys mean:

| Key | Is the secret readable in... |
|---|---|
| `plan_text_shows_variable_secret` | the text that `terraform plan` prints (the demo password) |
| `plan_json_shows_variable_secret` | the output of `terraform show -json plan.tfplan` (the demo password) |
| `plan_json_shows_random_secret` | the same JSON (the random password) |
| `plan_file_shows_variable_secret` | `plan.tfplan` itself, after you unzip it (the demo password) |
| `state_file_shows_variable_secret` | `terraform.tfstate` (the demo password) |
| `state_file_shows_random_secret` | `terraform.tfstate` (the random password) |
| `show_state_text_shows_any_secret` | the text that `terraform show` prints (either secret) |
| `output_text_shows_random_secret` | the text that `terraform output` prints |
| `output_json_shows_random_secret` | the text that `terraform output -json` prints |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | Edit `predictions.json` | Guess. Put `true` where you think the secret is readable. |
| 2 | `node challenges/challenge-6-plans-and-drift/part-3-sensitive-values-in-plans/run.mjs` | Plans, reads the JSON, unzips the plan file, applies, greps the state, runs `show` and `output`, then lists every wrong guess. About 1 minute. |
| 3 | Fix `predictions.json`, run again | Until no line says `WRONG`. |
| 4 | `node --test challenges/challenge-6-plans-and-drift/part-3-sensitive-values-in-plans/test.mjs` | Passes when every prediction matches. Each failure says which one. |
| 5 | `node toolkit/show-facts.mjs c6.p3` | Shows the saved numbers. |

Add `--reference` to `run.mjs`, or set `TFC_REFERENCE=1`, to run with the reference answers.

## What you should see

In the recorded run (the demo password is a made-up value; the random one differs on every run):

1. **Plan text:** `(sensitive value)` for both secrets. The random password is not in the plan at all.
2. **Plan JSON:** `variables.db_password.value` holds the demo password; so does `terraform_data.db` under `change.after.input`, next to `after_sensitive.input: true`. For `terraform_data.api` the input is `after_unknown`.
3. **The plan file** looks like binary: its raw bytes do not contain the password. Unzipped, the entry `tfplan` does.
4. **The state file** holds both secrets.
5. **`terraform show`** hides `input` and `result` but prints `output` of both `terraform_data` resources in clear, which are copies of the secrets. **`terraform output`** hides the token; **`terraform output -json`** prints it.

Note step 5: it is a find of this run, not a rule of Terraform. A value copied into another attribute may lose its label. Check, do not assume.

The full recorded run is in [results.md](results.md).

![Places where a secret is readable](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c6.p3.plan_text_shows_variable_secret` | Whether the demo password appears in the text printed by `terraform plan`. |
| `c6.p3.plan_json_shows_variable_secret`, `c6.p3.plan_json_shows_random_secret` | Whether each secret appears in `terraform show -json plan.tfplan`. |
| `c6.p3.plan_file_shows_variable_secret` | Whether the demo password appears in any entry of `plan.tfplan` after unzipping it (the zip is read with Node's `zlib`). |
| `c6.p3.state_file_shows_variable_secret`, `c6.p3.state_file_shows_random_secret` | Whether each secret appears in `terraform.tfstate`. The random one is read from `terraform output -raw api_token`. |
| `c6.p3.show_state_text_shows_any_secret` | Whether either secret appears in the text printed by `terraform show`. |
| `c6.p3.output_text_shows_random_secret`, `c6.p3.output_json_shows_random_secret` | Whether the random password appears in `terraform output` and `terraform output -json`. |
| `c6.p3.plan_json_sensitive_flag_set`, `c6.p3.random_password_unknown_in_plan` | In the plan JSON: `after_sensitive.input` of `terraform_data.db` is true; `after_unknown.input` of `terraform_data.api` is true. |
| `c6.p3.predictions_correct_count`, `c6.p3.predictions_total_count`, `c6.p3.places_with_secret_count` | How many of your answers matched, how many there are (9), and how many places held a secret. |

## What is different on your machine

- **Linux and WSL2, Docker Desktop, Codespace:** the same. By default Terraform runs from the pinned container image, so the plan file and the JSON are the same on every platform. A local binary of 1.17 or newer gives the same results.
- The demo password is passed as `TF_VAR_db_password`, so it is visible in the command line of the container for a moment. It is a made-up value for this challenge. Never use a real secret here.
- The random password and the resource ids differ on every run.

## Stuck?

- `Failed to install provider` or similar: another run was writing the shared plugin cache. `run.mjs` retries by itself.
- A prediction stays wrong: look at the matching step in the output. The plan file one needs the unzipped view, not the raw bytes.
- Nothing is left in Docker by this part. To be sure: `node toolkit/cleanup.mjs 6`.
