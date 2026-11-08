# Challenge 9 notes: secrets

Built from real runs of Terraform 1.17.1 (image `hashicorp/terraform:1.17.1`, `TFC_MODE=docker`), `hashicorp/random` 3.9.1, `hashicorp/local` 2.9.1, Windows 11 with Docker Desktop, Node 22.22.2. No Docker objects are created in this challenge; the Docker provider is only loaded once, to read its schema. Every secret is fake or random and is never printed.

## What each part proves

- **Part 1, find the secret.** The learner predicts, for nine places, whether the fake `db_password` appears in plain text. The run looks. It is in `terraform.tfstate`, `terraform.tfstate.backup`, `terraform show -json`, `terraform output -json`, `terraform show -json` of a saved plan, and in the file the config writes. It is not in `terraform output`, in the plan text, or in a `TF_LOG=TRACE` run. The generated `random_password` is in state and in `output -json` too.
- **Part 2, ephemeral.** Changing `resource "random_password"` to `ephemeral "random_password"` keeps the password out of state, `show -json` and a saved plan while an `ephemeral "local_command"` still receives it. Ephemeral resources are opened in every phase (the command ran once at plan and again at apply). An ephemeral value in a normal attribute is refused. None of the course providers has a write-only attribute.
- **Part 3, clean logs.** A CI wrapper (`ci.mjs`) uses a scanner the learner writes (`scan.mjs`: plain, URL-encoded and base64 forms, minimum length, no secret in the finding) to fail a build. The run proves the scanner on a stack that is known to leak, and then checks the learner's own stack (an ephemeral variable handed to an ephemeral command) is clean in the plan text, plan JSON, apply text and state.

## Where reality differed from the plan or the dossier

1. **No write-only attribute exists in the five providers.** `terraform providers schema -json` over random, local, null, time, docker (and the built-in `terraform` provider) finds 0 attributes with `write_only` true. The dossier says write-only attributes arrived in Terraform 1.11; that is a language feature, and it needs a provider that offers one. The only ephemeral resources are `local_command`, `random_bytes` and `random_password`. Part 2 therefore consumes the ephemeral password with `ephemeral "local_command"`, whose command writes `vault.out` (a stand-in for a secrets manager). The part says so plainly instead of faking a write-only attribute.
2. **`TF_LOG=TRACE` did not print either secret.** Neither the fake variable value nor the generated password appeared in 2,000+ lines of TRACE output for an apply that created a `local_file` with both. The brief expected the secret to show up in debug logs. Recorded as a fact of this run (`c9.p1.found_trace_log` is false), with the warning that other providers or scripts may log it. The part does not teach "debug logs always leak".
3. **A plan before the first apply does not hold the generated password**: its value is unknown at plan time. The saved-plan check in part 1 therefore finds only the value passed in (`variables` in the plan JSON); part 2 uses a second plan after the apply, whose `prior_state` holds everything.
4. **Ephemeral resources run at plan time, when their input is known.** With the ephemeral password, `runs.log` has one line after plan and two after apply. With a normal resource as input (the starter) the command is deferred at plan (`Configuration unknown, deferring...`) and runs once, at apply.
5. **`local_command` needs `sh` and `cat`.** In docker mode they come from the Terraform image, so it works on every host. A native Windows local binary has no `sh`; the READMEs say to use docker mode.
6. **Lock files.** Each part folder carries the `.terraform.lock.hcl` the reference run produced.
7. **Shared plugin cache races** (`text file busy`, checksum mismatch of the cached package) happen when other challenges run at the same moment. `lib.mjs` retries.

## Starter failures

Part 1: `predictions.json` is all `false`, so six of nine places are wrong (`matches_prediction_count` 3). Part 2: `terraform.tfstate`, `terraform show -json` and the saved plan all contain the password (`secret_in_state` true). Part 3: both CI builds are green while four files hold the token (`learner_ci_exit_code` 0, `fixture_ci_exit_code` 0).

## Lines to quote

Part 1 (`part-1-find-the-secret/results.md`):

- `+ content              = (sensitive value)` in the plan text.
- `api_key = <sensitive>` and `db_password = <sensitive>` from `terraform output`.
- The state line `"content": "db_password=fake-db-password-not-real\napi_key=<generated>\n"`.
- `"variables":{"db_password":{"value":"fake-db-password-not-real"}}` in the plan JSON.

Part 2 (`part-2-ephemeral/results.md`):

- `ephemeral.local_command.store: Configuration unknown, deferring...` (starter, plan).
- `times the store command has run: 1` after plan and `2` after apply (reference).
- `Error: Invalid use of ephemeral value` / `Ephemeral values are not valid for "content", because it is not a write-only attribute and must be persisted to state.`
- `write-only attributes found: 0` and `ephemeral resources found: 3 (local_command, random_bytes, random_password)`.

Part 3 (`part-3-clean-logs/results.md`):

- `LEAK: logs/plan.txt:11: API_TOKEN found as plain` ... `ci: build failed, 7 place(s) hold a secret.`
- `ci: ok, 4 file(s) scanned, no secret found.`

## Platform differences

- Docker Desktop on Windows was the only platform run.
- A local binary needs `sh` and `cat` for parts 2 and 3.
