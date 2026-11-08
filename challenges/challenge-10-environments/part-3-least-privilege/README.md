# Challenge 10, part 3: least privilege by token

**Time:** about 40 minutes. **Download:** none (`alpine:3.23` is on your machine; the Docker provider comes from the plugin cache). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Part 2 gave every environment its own state. A developer who works in `envs/dev` cannot hurt the prod state by accident any more. But can the developer reach it on purpose, or by a copy-paste? That depends on one question: who holds the key to the prod state?

In many repositories the answer is "everybody who can read the repository". The password to the state sits in a config file, committed on the first day because it was quicker. A new intern clones the repository and can read, change and delete the prod state. A CI job built for dev holds the same password. This part finds that hole, closes it, and proves with real errors that it is closed.

## The idea

**Least privilege** means every person and every job gets the smallest set of permissions that lets it do its work, and nothing more.

For Terraform state, that means one **credential** (a token or a password) per environment, and each identity holds only the credentials of the environments it works in:

- a **developer** uses dev, and has no prod credential at all;
- a **CI job** is an identity too. The job that deploys dev holds the dev credential. The job that deploys prod holds the prod credential. They never share one;
- a **secret store** (in real life: your CI system's secrets, a vault) hands each credential to the job that needs it, as an environment variable. It never goes into a file in Git.

The `http` backend reads the user name and password from `username` and `password` in its configuration, and falls back to the environment variable `TF_HTTP_PASSWORD` when `password` is not set. A password written in a file always wins over the variable, which is exactly what makes a committed password dangerous.

The teaching server (`toolkit/state-server.mjs`) checks the first part of the state name (`dev` in `dev/app`) against a token with that name. A request without the right token gets `401`. One limit to keep in mind: the teaching server has one token per environment and the token can read, lock and write. Real backends do better. For example, an object store with a policy per identity can give a plan job read access only. The idea you practise here is the same.

## Your task

Two faults are planted.

1. **Passwords in files.** `envs/dev/backend.hcl` and `envs/prod/backend.hcl` each contain a `password` line. Delete both lines. The password will come from `TF_HTTP_PASSWORD`, which `run.mjs` sets for each identity from its own "secret store".
2. **A CI job that holds too much.** `identities.json` is the access policy: for each identity, the environments it may use. The entry `ci-dev` includes `prod`. Remove it. The CI job for dev must have dev only.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-10-environments/part-3-least-privilege/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | Edit `envs/dev/backend.hcl`, `envs/prod/backend.hcl` and `identities.json` | Remove the two passwords and the extra grant. |
| 3 | `node challenges/challenge-10-environments/part-3-least-privilege/run.mjs` | About 5 minutes. Starts the state server on port 8821 with one token per environment, builds both environments as an admin who holds both tokens, then lets four identities try both folders. |
| 4 | `node --test challenges/challenge-10-environments/part-3-least-privilege/test.mjs` | Passes when no token is in a file and each identity has its own environment only. |
| 5 | `node toolkit/show-facts.mjs c10.p3` | Shows the saved numbers. |

Add `--reference` to step 3 to run the solution. Add `--record` to write `results.md`. If port 8821 is busy, stop whatever uses it first. The tokens in `run.mjs` are teaching values, not secrets: do not reuse them anywhere.

## What you should see

The recorded run is in [results.md](results.md). In short:

- The search for the token strings finds no file.
- A developer who holds only the dev token can run `terraform init` and `terraform plan` in `envs/dev`. In `envs/prod` it stops at `terraform init` with `Error: Error loading state: HTTP remote state endpoint requires auth`. The state server answered 401. There is nothing to plan or apply, because Terraform cannot read the prod state at all.
- A laptop with no credentials is denied in both folders, with the same message.
- The CI job for dev can apply in dev and is denied in prod. The CI job for prod is the other way round.
- Four requests got the answer 401, and the prod state kept its serial number (`1`) through every try.

With the starter, the developer and the laptop with no credentials both get into prod and dev, because the password in the file is used whatever the environment says, and the dev CI job is allowed into prod because the policy says so.

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c10.p3.secrets_in_files_count` | Files in the work folder that contain one of the token strings. |
| `c10.p3.dev_engineer_dev_ok`, `c10.p3.dev_engineer_prod_denied` | `terraform init` and `terraform plan` in each folder, with the token the developer holds. |
| `c10.p3.nobody_denied` | The same with no `TF_HTTP_PASSWORD`. |
| `c10.p3.ci_dev_dev_ok`, `c10.p3.ci_dev_prod_denied`, `c10.p3.ci_prod_prod_ok`, `c10.p3.ci_prod_dev_denied` | The same for the two CI identities. |
| `c10.p3.denied_requests_count` | Requests the state server answered with 401. |
| `c10.p3.prod_serial_unchanged` | The `serial` of the prod state on the server before and after all tries. |
| `c10.p3.denial_text` | The first lines of the error the developer got in `envs/prod`. |

## Platform box

- **Linux, WSL2, Docker Desktop, Codespace:** the same output. The password reaches Terraform in the container through an environment variable that the toolkit passes with `-e`.
- **Local binary:** a Terraform 1.17 or newer binary on your PATH gives the same output. `TF_HTTP_PASSWORD` is read from the process environment.
- **Not shown here:** the token still travels in plain HTTP to a server on your own machine. A real state backend uses HTTPS and short-lived credentials.

[SAFETY.md](../../../SAFETY.md)
