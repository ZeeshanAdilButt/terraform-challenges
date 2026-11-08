# Results: Challenge 11, part 3: two pipeline runs, one lock

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
node toolkit/state-server.mjs --port 8830 --dir work/.state   (started from run.mjs, in this process)
```

**Output**

```text
State server on port 8830.
```

**Note:** The same teaching server as before. Every lock request is logged with its answer: 200 (you have the lock) or 423 (somebody else has it).

## Step 2

**Command**

```sh
node ci/pipeline.mjs runA --message base
```

**Output**

```text
[init] terraform init -input=false -backend-config=backend.hcl
[init] ok after Ns
[plan] terraform plan -input=false -out=plan.tfplan -var=message=base -lock-timeout=0s
[plan] ok after Ns
[apply] terraform apply -input=false -lock-timeout=0s plan.tfplan
[apply] ok after Ns
pipeline: applied.
```

**Note:** One run on its own: init, plan, apply. The apply step includes a resource that takes 30 seconds, like a real deployment. The apply step took 41.6 s here (the thirty seconds of waiting plus Terraform's own work).

## Step 3

**Command**

```sh
run A:  LOCK_TIMEOUT=0s node ci/pipeline.mjs runA --message A0
run B:  LOCK_TIMEOUT=0s node ci/pipeline.mjs runB --message B0   (started while A holds the lock)
```

**Output**

```text
--- run A (exit 0) ---
[init] ok after Ns
[plan] ok after Ns
[apply] ok after Ns
pipeline: applied.
--- run B (exit 1) ---
[init] terraform init -input=false -backend-config=backend.hcl
[init] ok after Ns
[plan] terraform plan -input=false -out=plan.tfplan -var=message=B0 -lock-timeout=0s
[plan] FAILED (exit 1) after Ns
Error: Error acquiring the state lock
Error message: HTTP remote state already locked:
ID=<id>
Lock Info:
  ID:        <id>
  Path:
  Operation: OperationTypeApply
  Who:       <user>@<host>
  Version:   1.17.1
  Created:   <time>
  Info:
Terraform acquires a state lock to protect the state from being written
by multiple users at the same time. Please resolve the issue above and try
again. For most commands, you can disable locking with the "-lock=false"
```

**Note:** Run B asked for the lock, was told "locked" and stopped. Nothing was changed by B. Its error shows who holds the lock and since when. Run A carried on and finished.

## Step 4

**Command**

```sh
run A:  node ci/pipeline.mjs runA --message A1
run B:  LOCK_TIMEOUT=120s node ci/pipeline.mjs runB --message B1   (started while A holds the lock)
```

**Output**

```text
--- run A (exit 0) ---
[init] ok after Ns
[plan] ok after Ns
[apply] ok after Ns
pipeline: applied.
--- run B (exit 0) ---
[init] terraform init -input=false -backend-config=backend.hcl
[init] ok after Ns
[plan] terraform plan -input=false -out=plan.tfplan -var=message=B1 -lock-timeout=120s
[plan] ok after Ns (it had to wait for the lock)
[apply] terraform apply -input=false -lock-timeout=120s plan.tfplan
[apply] ok after Ns
pipeline: applied.
```

**Note:** Run B waited for run A to let go of the lock, then planned against the state A had just written and applied. Waits measured in three repetitions: 31 s, 31 s, 31 s. Median 31 s.

## Step 5

**Command**

```sh
docker inspect (MESSAGE of the container), after run B of each repetition
```

**Output**

```text
tfc-c11-p3-app: MESSAGE=B3   (the last run to apply was B3)
repetitions where both runs ended with exit code 0 and B's message won: 3 of 3
```

**Note:** The runs took turns. The last run to get the lock wrote the final state, and the state matches the container.

## Step 6

**Command**

```sh
cd runA && terraform destroy -auto-approve
docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=11)
```

**Output**

```text
Destroy complete! Resources: 3 destroyed.
0 containers, 0 networks, 0 volumes
```

**Note:** The part ends with a destroy, which takes the lock like any other run. The state server is stopped.
