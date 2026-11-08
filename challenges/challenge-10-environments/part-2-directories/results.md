# Results: Challenge 10, part 2: one directory and one state per environment

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
node toolkit/state-server.mjs --port 8820 --dir work/.state   (started from run.mjs, in this process)
```

**Output**

```text
State server on port 8820.
```

**Note:** A tiny server that speaks the http backend protocol, with locking. Teaching only: no encryption.

## Step 2

**Command**

```sh
cat envs/prod/backend.hcl
```

**Output**

```text
address        = "http://<host>:8820/state/prod/app"
lock_address   = "http://<host>:8820/lock/prod/app"
unlock_address = "http://<host>:8820/lock/prod/app"
```

**Note:** The state has a name (prod/app) and a lock has a name. Without lock_address, the http backend does not lock at all. <host> stands for the machine that runs the server.

## Step 3

**Command**

```sh
cd envs/prod && terraform init -backend-config=backend.hcl
```

**Output**

```text
Initializing the backend...
Successfully configured the backend "http"! Terraform will automatically
use this backend unless the backend configuration changes.
Terraform has been successfully initialized!
```

**Note:** Each folder has its own .terraform directory and points at its own state. The same was done in envs/dev.

## Step 4

**Command**

```sh
cd envs/dev && terraform apply -auto-approve
cd envs/prod && terraform apply -auto-approve
```

**Output**

```text
dev:  Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
prod: Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
```

**Note:** Two applies, two states, one server.

## Step 5

**Command**

```sh
ls -R work/.state
docker ps -a --filter label=tfc.challenge=10 --format {{.Names}}
```

**Output**

```text
dev/app.json
prod/app.json
dev state:  serial 1, 2 resources
prod state: serial 1, 2 resources
tfc-c10-p2-dev-app
tfc-c10-p2-prod-app
```

**Note:** One state file per environment on the server, and no terraform.tfstate in either folder. The container names say which environment they belong to.

## Step 6

**Command**

```sh
edit envs/dev/main.tf (GREETING=hello-dev)
cd envs/dev && terraform apply -auto-approve
cd envs/prod && terraform plan
```

**Output**

```text
Plan: 1 to add, 0 to change, 1 to destroy.
Apply complete! Resources: 1 added, 0 changed, 1 destroyed.
dev state:  serial 2
prod state: serial 1
prod plan: No changes.
```

**Note:** The dev change moved the dev state forward. The prod state did not move at all. A mistake in this folder cannot reach the other state.

## Step 7

**Command**

```sh
what the state server logged during that dev apply
```

**Output**

```text
GET /state/dev/app -> 200
LOCK /lock/dev/app -> 200
GET /state/dev/app -> 200
POST /state/dev/app -> 200
UNLOCK /lock/dev/app -> 200
```

**Note:** Every run takes the lock first, reads the state, writes the new state and releases the lock. All of it is on the dev name only.

## Step 8

**Command**

```sh
cd envs/dev && terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 2 destroyed.
```

**Note:** Dev is meant to be thrown away, so nothing guards it.

## Step 9

**Command**

```sh
cd envs/prod && terraform destroy -auto-approve
```

**Output**

```text
Error: Instance cannot be destroyed
  on main.tf line 21:
  21: resource "docker_container" "app" {
Resource docker_container.app has lifecycle.prevent_destroy set, but the plan
calls for this resource to be destroyed. To avoid this error and continue
with the plan, either disable lifecycle.prevent_destroy or reduce the scope
of the plan using the -target option.
```

**Note:** prevent_destroy stops the plan before anything is destroyed. Both resources stay.

## Step 10

**Command**

```sh
delete the lifecycle block from envs/prod/main.tf
cd envs/prod && terraform plan -destroy
```

**Output**

```text
Plan: 0 to add, 0 to change, 2 to destroy.
```

**Note:** Delete the block, and the same destroy is planned without any complaint. The guard is part of the code, so it is only as safe as your code review.

## Step 11

**Command**

```sh
delete the whole docker_container block from envs/prod/main.tf
cd envs/prod && terraform plan
```

**Output**

```text
  # docker_container.app will be destroyed
  # (because docker_container.app is not in configuration)
Plan: 0 to add, 0 to change, 1 to destroy.
```

**Note:** Delete the resource and its lifecycle rule goes with it. Terraform plans the destroy, because the rule can only guard resources that are still in the code.

## Step 12

**Command**

```sh
remove the lifecycle block again, then cd envs/prod && terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 2 destroyed.
prod state on the server: serial 2, 0 resources
```

**Note:** This is how the part cleans up. In real life you would stop and ask who removed the guard, and why.

## Step 13

**Command**

```sh
docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=10)
```

**Output**

```text
0 containers, 0 networks, 0 volumes
```

**Note:** The server is stopped and everything this part built is gone.
