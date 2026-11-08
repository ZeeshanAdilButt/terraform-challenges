# Results: Challenge 14, part 3: break it and recover it

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
node toolkit/state-server.mjs --port 8852   (started from run.mjs)
cd capstone/envs/dev && terraform init -backend-config=backend.hcl
```

**Output**

```text
Successfully configured the backend "http"! Terraform will automatically
```

**Note:** The same dev environment as in part 1, with its state on the state server.

## Step 2

**Command**

```sh
docker run -d --name tfc-c14-squatter -p 127.0.0.1:18401:80 nginx:1.27-alpine
```

**Output**

```text
e725bb410806
```

**Note:** Another program already uses the port that the dev web container wants. Any program can: an old container, a dev server you forgot, another project.

## Step 3

**Command**

```sh
cd capstone/envs/dev && terraform apply -auto-approve   (the port is taken)
```

**Output**

```text
docker_volume.cache_data: Creating...
module.service.docker_image.cache: Creating...
module.service.docker_image.web: Creating...
module.service.docker_network.this: Creating...
docker_volume.cache_data: Creation complete after Ns [id=tfc-c14-dev-cache-data]
module.service.docker_image.cache: Creation complete after Ns [id=sha256:...]
module.service.docker_image.web: Creation complete after Ns [id=sha256:...]
Error: Unable to start container: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint tfc-c14-dev-web (ce5f3a6966441f74d1504957b9f4544e51fc1a4eb0efa527a12bbd3cfd103839): Bind for 127.0.0.1:18401 failed: port is already allocated
  with module.service.docker_container.web,
  on ../../modules/service/main.tf line 63, in resource "docker_container" "web":
  63: resource "docker_container" "web" {
exit code 1
```

**Note:** Terraform built what it could, then the web container failed to start. The apply stopped. What it had built stays built.

## Step 4

**Command**

```sh
terraform state list ; docker ps -a --filter label=tfc.challenge=14 ; terraform plan
```

**Output**

```text
docker_volume.cache_data
module.service.docker_container.cache
module.service.docker_container.web
module.service.docker_image.cache
module.service.docker_image.web
module.service.docker_network.this
tfc-c14-dev-cache    running
tfc-c14-dev-web      created
  # module.service.docker_container.web is tainted, so must be replaced
Plan: 1 to add, 0 to change, 1 to destroy.
```

**Note:** Three kinds of truth now disagree: the state has the web container, Docker has it in status "created" (never started), and the plan wants to replace it. The cache is healthy. Read all three before you touch anything.

## Step 5

**Command**

```sh
docker rm -f tfc-c14-squatter ; terraform apply -auto-approve ; curl http://127.0.0.1:18401
```

**Output**

```text
Apply complete! Resources: 1 added, 0 changed, 1 destroyed.
tfc-c14-dev-cache    running
tfc-c14-dev-web      running
cache container unchanged: true
web: HTTP 200
```

**Note:** Free the port, then apply again. Terraform replaces only the half-built web container. The cache, and the data on its volume, was never touched.

## Step 6

**Command**

```sh
terraform plan   (a pipeline job was killed in the middle of an apply and never released the lock)
```

**Output**

```text
(LOCK request answered 200: the lock is held)
Error: Error acquiring the state lock
Error message: HTTP remote state already locked:
ID=b5e1c0de-2d6a-4a63-9d2c-5f0f6c7e8a14
Lock Info:
  ID:        b5e1c0de-2d6a-4a63-9d2c-5f0f6c7e8a14
  Path:
  Operation: OperationTypeApply
  Who:       runner@github-actions-7
  Version:   1.17.1
  Created:   2026-11-08 19:09:05.964 +0000 UTC
  Info:
Terraform acquires a state lock to protect the state from being written
by multiple users at the same time. Please resolve the issue above and try
again. For most commands, you can disable locking with the "-lock=false"
flag, but this is not recommended.
exit code 1
```

**Note:** Nothing is running, yet the state is locked. The error names the lock: its ID, who took it, when, and with which version. Everything the runbook needs is in this message.

## Step 7

**Command**

```sh
terraform force-unlock -force b5e1c0de-2d6a-4a63-9d2c-5f0f6c7e8a14 ; terraform plan
```

**Output**

```text
Terraform state has been successfully unlocked!
lock held afterwards: false
No changes. Your infrastructure matches the configuration.
```

**Note:** In this order: 1. find out whether the job that holds the lock is still alive (the Who and Created lines say where to look). 2. Only when it is dead, force-unlock with the ID from the error. 3. Plan before the next apply. force-unlock on a live run lets two applies write one state.

## Step 8

**Command**

```sh
terraform state pull > capstone/backups/dev-before-loss.tfstate
```

**Output**

```text
serial 2, lineage 97e4c312..., 6 resources, 16758 bytes
```

**Note:** A copy of the state, taken while everything is fine. Run it before every apply in the pipeline, and keep the copies somewhere that is not the state server. The file is in .gitignore because a state can hold secrets.

## Step 9

**Command**

```sh
(the state file on the server is deleted)  terraform state list ; terraform plan ; docker ps
```

**Output**

```text
terraform state list: No state file was found!

State management commands require a state file. Run this command
in a directory where Terraform has been run or use the -state flag
to point the command to a specific state location.
  # docker_volume.cache_data will be created
  # module.service.docker_container.cache will be created
  # module.service.docker_container.web will be created
  # module.service.docker_image.cache will be created
  # module.service.docker_image.web will be created
  # module.service.docker_network.this will be created
Plan: 6 to add, 0 to change, 0 to destroy.
tfc-c14-dev-cache    running
tfc-c14-dev-web      running
```

**Note:** Terraform remembers nothing, so it plans to build everything again, including containers that already run. A plan that wants to add what you already have means the state is lost. Do not apply it.

## Step 10

**Command**

```sh
terraform apply -auto-approve   (someone applies anyway)
```

**Output**

```text
docker_volume.cache_data: Creating...
module.service.docker_network.this: Creating...
module.service.docker_image.cache: Creating...
module.service.docker_image.web: Creating...
docker_volume.cache_data: Creation complete after Ns [id=tfc-c14-dev-cache-data]
module.service.docker_image.cache: Creation complete after Ns [id=sha256:...]
Error: Unable to create network: Error response from daemon: network with name tfc-c14-dev-net already exists
  with module.service.docker_network.this,
  on ../../modules/service/main.tf line 14, in resource "docker_network" "this":
  14: resource "docker_network" "this" {
exit code 1
```

**Note:** Docker refuses a second network with the same name (the containers would be refused next: their names are taken too). The error is the real world telling you that the state does not match. The apply also wrote a new, partial state, so restoring the copy must overwrite it: that is why the next command has -force.

## Step 11

**Command**

```sh
terraform state push -force ../../backups/dev-before-loss.tfstate ; terraform plan
docker exec tfc-c14-dev-cache valkey-cli GET capstone
```

**Output**

```text
push exit code 0
No changes. Your infrastructure matches the configuration.
containers unchanged: true
cache value: hello
```

**Note:** Pushing the copy back makes Terraform remember again. The plan says No changes, the containers are the same ones, and the data on the volume is intact. The copy is only as new as the day you took it: anything applied since is missing, and the plan will show it.

## Step 12

**Command**

```sh
docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=14)
```

**Output**

```text
0 containers, 0 networks, 0 volumes
```

**Note:** Everything this part made is gone (cleanup by label). The images stay on your machine (keep_locally).
