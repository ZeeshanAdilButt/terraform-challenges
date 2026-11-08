# Results: Challenge 14, part 2: ship it through a pipeline

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
gh api repos/<owner>/<repo>/commits/<tag> -q .sha   (for every uses: line of .github/workflows/terraform.yml)
```

**Output**

```text
actions/checkout@3d3c42e5aac5...  # v7.0.1  verified: the tag points to this commit
actions/setup-node@949feb2413d6...  # v7.1.0  verified: the tag points to this commit
hashicorp/setup-terraform@dfe3c3f87815...  # v4.0.1  verified: the tag points to this commit
actions/upload-artifact@cf430e030ddb...  # v7.0.2  verified: the tag points to this commit
actions/download-artifact@9000827ccba6...  # v8.0.2  verified: the tag points to this commit
```

**Note:** A tag can be moved to other code. A full commit SHA cannot. The comment keeps the version readable, and gh api proves that the comment and the SHA agree.

## Step 2

**Command**

```sh
node toolkit/state-server.mjs --port 8851   (started from run.mjs, a token for dev and one for prod)
```

**Output**

```text
State server on port 8851.
```

**Note:** The state lives outside every step, like a real backend: each step below is a separate process and finds the state where the last one left it.

## Step 3

**Command**

```sh
node capstone/ci/pipeline.mjs check dev
node capstone/ci/pipeline.mjs check prod
```

**Output**

```text
terraform fmt -check -recursive ... ok
terraform init -input=false -backend=false ... ok
terraform validate ... ok
terraform fmt -check -recursive ... ok
terraform init -input=false -backend=false ... ok
terraform validate ... ok
```

**Note:** The cheap checks first: format, init without a backend, validate. No state is read and nothing is planned.

## Step 4

**Command**

```sh
node capstone/ci/pipeline.mjs plan dev
node capstone/ci/pipeline.mjs plan prod
```

**Output**

```text
terraform init -input=false -reconfigure ... ok
terraform plan -input=false -lock-timeout=60s -out=dev.tfplan ... ok
terraform show -json dev.tfplan ... ok
Plan: 6 to add, 0 to change, 0 to destroy.
node capstone/gate/plan-gate.mjs dev/dev.plan.json ... exit 0
gate: ok, 6 resource changes, none removes a protected resource.
terraform init -input=false -reconfigure ... ok
terraform plan -input=false -lock-timeout=60s -out=prod.tfplan ... ok
terraform show -json prod.tfplan ... ok
Plan: 6 to add, 0 to change, 0 to destroy.
node capstone/gate/plan-gate.mjs prod/prod.plan.json ... exit 0
gate: ok, 6 resource changes, none removes a protected resource.
```

**Note:** The plan step saves the plan to a file, turns it into JSON and hands the JSON to your gate. Creating things is allowed: the gate only looks at what a plan removes.

## Step 5

**Command**

```sh
node capstone/ci/pipeline.mjs apply dev
node capstone/ci/pipeline.mjs apply prod
```

**Output**

```text
terraform init -input=false -reconfigure ... ok
terraform apply -input=false -lock-timeout=60s dev.tfplan ... ok
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.
terraform init -input=false -reconfigure ... ok
terraform apply -input=false -lock-timeout=60s prod.tfplan ... ok
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.
```

**Note:** The apply step applies the saved plan file and nothing else. It does not plan again.

## Step 6

**Command**

```sh
edit capstone/envs/prod/main.tf (memory_mb 128 to 96)
node capstone/ci/pipeline.mjs plan prod
node capstone/ci/pipeline.mjs apply prod
```

**Output**

```text
terraform init -input=false -reconfigure ... ok
terraform plan -input=false -lock-timeout=60s -out=prod.tfplan ... ok
terraform show -json prod.tfplan ... ok
Plan: 0 to add, 1 to change, 0 to destroy.
node capstone/gate/plan-gate.mjs prod/prod.plan.json ... exit 0
gate: ok, 6 resource changes, none removes a protected resource.
terraform init -input=false -reconfigure ... ok
terraform apply -input=false -lock-timeout=60s prod.tfplan ... ok
Apply complete! Resources: 0 added, 1 changed, 0 destroyed.
plan afterwards: No changes. Your infrastructure matches the configuration.
```

**Note:** A one-line pull request, a one-line plan: an in-place update of the web container. The gate passes it and the saved plan is applied.

## Step 7

**Command**

```sh
edit capstone/envs/prod/main.tf (cache_image valkey/valkey:8-alpine to valkey/valkey:8.0-alpine)
node capstone/ci/pipeline.mjs plan prod
(exit code: the job fails, so the apply job never starts)
```

**Output**

```text
terraform init -input=false -reconfigure ... ok
terraform plan -input=false -lock-timeout=60s -out=prod.tfplan ... ok
terraform show -json prod.tfplan ... ok
Plan: 2 to add, 1 to change, 2 to destroy.
node capstone/gate/plan-gate.mjs prod/prod.plan.json ... exit 1
BLOCKED: module.service.docker_container.cache would be delete then create, and it is labelled protected.
(exit code 1)
cache container id unchanged: true
```

**Note:** The pull request changes one line: a new image tag. The plan would destroy and rebuild the cache container. Your gate reads the plan, sees the label tfc.protected = true on the container that exists now, and fails the job. The apply job needs the plan job, so it is skipped.

## Step 8

**Command**

```sh
edit capstone/envs/prod/main.tf (rename the data volume)
node capstone/ci/pipeline.mjs plan prod
```

**Output**

```text
terraform init -input=false -reconfigure ... ok
terraform plan -input=false -lock-timeout=60s -out=prod.tfplan ... FAILED (exit 1)
Error: Instance cannot be destroyed
  on main.tf line 39:
  39: resource "docker_volume" "cache_data" {
Resource docker_volume.cache_data has lifecycle.prevent_destroy set, but the
plan calls for this resource to be destroyed. To avoid this error and
continue with the plan, either disable lifecycle.prevent_destroy or reduce
the scope of the plan using the -target option.
```

**Note:** A second guard, in a different place. prevent_destroy makes the plan itself fail, so the pipeline stops at the plan step. The gate guards what the plan allows; prevent_destroy guards what Terraform allows. Use both.

## Step 9

**Command**

```sh
node capstone/ci/pipeline.mjs plan prod   (memory 112)
someone else applies a different change (memory 100) by hand
node capstone/ci/pipeline.mjs apply prod
```

**Output**

```text
Plan: 0 to add, 1 to change, 0 to destroy.
Apply complete! Resources: 0 added, 1 changed, 0 destroyed.
terraform init -input=false -reconfigure ... ok
terraform apply -input=false -lock-timeout=60s prod.tfplan ... FAILED (exit 1)
Error: Saved plan is stale
The given plan file can no longer be applied because the state was changed by
another operation after the plan was created.
```

**Note:** The saved plan was made against an older state. Terraform refuses it and changes nothing. The pipeline must plan again and get a new review. This is why the apply job applies a file and never plans on its own.

## Step 10

**Command**

```sh
terraform destroy (dev, by hand)
state server A stops. State server B starts empty.  node capstone/ci/pipeline.mjs plan dev
state server B stops. State server C starts empty.  node capstone/ci/pipeline.mjs apply dev
```

**Output**

```text
Destroy complete! Resources: 6 destroyed.
terraform init -input=false -reconfigure ... ok
terraform plan -input=false -lock-timeout=60s -out=dev.tfplan ... ok
terraform show -json dev.tfplan ... ok
Plan: 6 to add, 0 to change, 0 to destroy.
node capstone/gate/plan-gate.mjs dev/dev.plan.json ... exit 0
gate: ok, 6 resource changes, none removes a protected resource.
terraform init -input=false -reconfigure ... ok
terraform apply -input=false -lock-timeout=60s dev.tfplan ... ok
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.
```

**Note:** This is what the two jobs of your workflow do: each runs on a fresh machine with a fresh teaching state server, and the plan saved by the first applies on the second because both states are empty. A real pipeline uses a backend that outlives the job.

## Step 11

**Command**

```sh
docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=14)
```

**Output**

```text
0 containers, 0 networks, 0 volumes
```

**Note:** Everything this part built is gone (cleanup by label). The images stay on your machine (keep_locally).
