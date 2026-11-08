# Results: Challenge 11, part 2: apply the saved plan

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
cd infra && terraform apply -auto-approve
```

**Output**

```text
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
```

**Note:** The starting point: an image resource, a data volume and the database container, built with db_mode = "standard".

## Step 2

**Command**

```sh
node ci/plan.mjs infra
node ci/gate.mjs infra/plan.json
```

**Output**

```text
terraform init -input=false ... ok
terraform plan -input=false -out=plan.tfplan ... ok
Plan: 1 to add, 0 to change, 0 to destroy.
Wrote plan.tfplan and plan.json

gate: the plan destroys nothing. Passed.
(exit code of the gate: 0)
```

**Note:** The pull request adds one volume. The plan is saved as plan.tfplan and a person reviews it. The gate passes because nothing is destroyed.

## Step 3

**Command**

```sh
someone merges db_mode = "fast" into the code after the review
node ci/apply.mjs infra plan.tfplan
docker inspect (DB_MODE of the container)
cd infra && terraform plan
```

**Output**

```text
terraform apply -input=false plan.tfplan ... ok
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
tfc-c11-p2-db: DB_MODE=standard  (same container as before: true)
plan afterwards: Plan: 1 to add, 0 to change, 1 to destroy.
```

**Note:** The apply step used the reviewed plan file. The new change was not part of it, so the container is untouched, and the next plan still shows the change that waits for its own review.

## Step 4

**Command**

```sh
node ci/plan.mjs infra
someone else runs: terraform apply -auto-approve -var db_mode=other
node ci/apply.mjs infra plan.tfplan
```

**Output**

```text
Plan: 1 to add, 0 to change, 1 to destroy.
Apply complete! Resources: 1 added, 0 changed, 1 destroyed.
terraform apply -input=false plan.tfplan ... FAILED (exit 1)
Error: Saved plan is stale
The given plan file can no longer be applied because the state was changed by
another operation after the plan was created.
(exit code of the apply step: 1)
```

**Note:** The plan was made against an older state. Terraform refuses it, and changes nothing. The pipeline must plan again and get a new review.

## Step 5

**Command**

```sh
edit infra/main.tf: rename the data volume
node ci/plan.mjs infra
node ci/gate.mjs infra/plan.json
node ci/apply.mjs infra plan.tfplan   (only if the gate passed)
```

**Output**

```text
Plan: 2 to add, 0 to change, 2 to destroy.
gate: the plan destroys 2 resources. Blocked.
  replace: docker_container.db
  replace: docker_volume.data
(exit code of the gate: 1)
apply step: skipped
tfc-c11-p2-data still exists: true
```

**Note:** The gate fails the pipeline, so the apply step never runs. The volume and its data are untouched. A person has to decide what happens next.

## Step 6

**Command**

```sh
cd infra && terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 4 destroyed.
```

**Note:** Everything this part built is removed.

## Step 7

**Command**

```sh
docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=11)
```

**Output**

```text
0 containers, 0 networks, 0 volumes
```

**Note:** Everything this part built is gone.
