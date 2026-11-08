# Notes on challenge 2: variables

## What each part proves

- **Part 1** (types, validation, precedence): a type constrains and converts, a `validation` block restricts and explains, a variable without a default is required, and the precedence order from the docs holds on Terraform 1.17.1: default, `TF_VAR_`, `terraform.tfvars`, `terraform.tfvars.json`, `*.auto.tfvars` (alphabetical), then `-var` and `-var-file` in command-line order. The learner predicts seven duels before running. The starter has three planted faults: `replicas` typed as string, and no validation on `project` or `replicas`. On the starter the test fails (the count is in the build report).
- **Part 2** (outputs and sensitive): `sensitive` hides values on screen and nowhere else. The starter has two outputs built from sensitive values without `sensitive = true`; the plan and apply fail with `Output refers to sensitive values`. After the fix, seven places are checked for the generated password (apply log, `output`, `output NAME`, `output -raw`, `output -json`, `show`, the state file).

## Problems hit and what differs per platform

- Each `terraform` call is a container start (3 to 5 seconds on Docker Desktop for Windows). Part 1 makes about 25 calls (a few minutes); `terraform console` carries the precedence measurement, one expression per call, because `console` with several expressions on stdin prints only the last result.
- **The mark does not follow every attribute.** `terraform_data.service` has `input = { name, token = var.api_token }`. `terraform show` prints `token = (sensitive value)` in `input` and the made-up token in plain text in the `output` attribute that terraform_data fills with a copy. This is not in the dossier. It is a real, repeatable leak, and it is quoted in part 2's results.
- `terraform output NAME` (one named output) prints the value of a sensitive output without any flag, as a quoted string. In the list form (`terraform output`) it prints `<sensitive>`. The dossier says `-json` and `-raw` show it in plain text; the run shows the named form does too.
- A configuration with only outputs and variables needs no `init` for `plan`/`console`, but `run.mjs` runs `init` anyway for part 1 so the folder is ready.
- The validation error contains `This was checked by the validation rule at variables.tf:7,3-13.`; the numbers depend on the learner's file, so the README tells learners theirs differ.
- When two outputs both lack `sensitive = true`, Terraform reports one error at a time (once for `token_length` on line 17, once for `db_password` on line 14 in separate scratch runs), so the learner fixes both before the plan passes. The test message names both.
- Plugin cache: part 2 ships its own `.terraform.lock.hcl` (random 3.9.1) so `init` does not rewrite the shared cache. Part 1 has no provider.

## Lines to quote

Required variable:

```text
Error: No value for required variable
The root module input variable "project" is not set, and has no default
value. Use a -var or -var-file command line argument to provide a value for
this variable.
```

Validation (the message line is the learner's own):

```text
Error: Invalid value for variable
    │ var.project is "Bad_Name"
This was checked by the validation rule at variables.tf:7,3-13.
```

Type errors (not validation):

```text
Error: Invalid value for input variable
Unsuitable value for var.replicas set using -var="replicas=...": a number is
required.
```

Precedence, lowest to highest, measured:

```text
default < env < tfvars < tfvars-json < auto-a < auto-b < var-file < var
```

`-var-file=extra.tfvars` then `-var greeting=var`: `var` wins. `-var greeting=var` then `-var-file=extra.tfvars`: `var-file` wins (the last one on the command line wins).

Sensitive:

```text
Error: Output refers to sensitive values
by adding the following argument:
    sensitive = true
```

```text
Outputs:

db_password = <sensitive>
service_name = "demo"
token_length = <sensitive>
```

`terraform output db_password`, `terraform output -raw db_password` and `terraform output -json` (`"sensitive": true` next to the plain value) print the password. `terraform show`:

```text
    output = {
        name  = "demo"
        token = "tfc-demo-token-not-real"
    }
```

The state file holds the password twice (the `random_password.db` attribute and the output) and the token twice (the `input` and the `output` of `terraform_data.service`).

## Deviations from the roadmap and the dossier

- The roadmap says part 1 shows "which of `-var`, `TF_VAR_`, `terraform.tfvars` wins". The run measures seven sources and the command-line order of `-var` and `-var-file`; the answer matches the Terraform docs, with the detail that `terraform.tfvars.json` beats `terraform.tfvars` and that `-var` does not always beat `-var-file`.
- The dossier says `sensitive` redacts CLI output only and that `output -json` and `-raw` show the value. Confirmed, and the run adds two findings: `output NAME` prints it too, and `terraform_data`'s `output` attribute drops the mark.
- Part 2 uses `random_password` and `terraform_data` (built in). No `local` or `docker` resource is needed in challenge 2.
