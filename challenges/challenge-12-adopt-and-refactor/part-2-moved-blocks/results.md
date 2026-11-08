# Results: Challenge 12, part 2: moved blocks

Recorded run. Machine: Windows 11, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply   (the OLD code: before/main.tf, three resources at the top level)
```

**Output**

```text
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
docker_container.cache
docker_container.web
docker_network.net
```

**Note:** This is the stack that exists. Its state knows the three old addresses.

## Step 2

**Command**

```sh
terraform init   (the REFACTORED code: a module, new names)
```

**Output**

```text
Initializing modules...
Terraform has been successfully initialized!
```

**Note:** The code now has module "app". The state does not know that yet.

## Step 3

**Command**

```sh
terraform plan   (no moved blocks)
```

**Output**

```text
  # docker_container.cache will be destroyed
  # (because docker_container.cache is not in configuration)
  # docker_container.web will be destroyed
  # (because docker_container.web is not in configuration)
  # docker_network.net will be destroyed
  # (because docker_network.net is not in configuration)
  # module.app.docker_container.backend will be created
  # module.app.docker_container.frontend will be created
  # module.app.docker_network.main will be created
Plan: 3 to add, 0 to change, 3 to destroy.
```

**Note:** Terraform sees three addresses it has never heard of and three in the state that the code no longer mentions. For Terraform that is: build three new things, destroy three old ones.

## Step 4

**Command**

```sh
terraform plan   (your moves.tf)
```

**Output**

```text
  # docker_container.cache has moved to module.app.docker_container.backend
  # docker_container.web has moved to module.app.docker_container.frontend
  # docker_network.net has moved to module.app.docker_network.main
Plan: 0 to add, 0 to change, 0 to destroy.
```

**Note:** The plan to aim for: every object is "moved", nothing is added, nothing is destroyed.

## Step 5

**Command**

```sh
terraform apply -auto-approve
```

**Output**

```text
Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
```

**Note:** A move is a change to the state only. Docker is not asked to do anything.

## Step 6

**Command**

```sh
docker inspect (id and StartedAt, before and after the refactor)
```

**Output**

```text
web    id a7eabde48a5f -> a7eabde48a5f   started 2026-11-08T18:50:38.919381246Z -> 2026-11-08T18:50:38.919381246Z
cache  id 43d5df39e385 -> 43d5df39e385   started 2026-11-08T18:50:38.786689388Z -> 2026-11-08T18:50:38.786689388Z
```

**Note:** Same ids, same start times: nothing was recreated.

## Step 7

**Command**

```sh
terraform state list ; terraform plan
```

**Output**

```text
module.app.docker_container.backend
module.app.docker_container.frontend
module.app.docker_network.main
No changes. Your infrastructure matches the configuration.
```

**Note:** The state has the new addresses. The plan is clean.

## Step 8

**Command**

```sh
terraform plan   (moves.tf taken away after the apply)
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
```

**Note:** For a state that has already applied the move, the blocks are no longer needed.

## Step 9

**Command**

```sh
terraform plan   (a teammate: old state, new code, no moved blocks)
```

**Output**

```text
  # docker_container.cache will be destroyed
  # docker_container.web will be destroyed
  # docker_network.net will be destroyed
  # module.app.docker_container.backend will be created
  # module.app.docker_container.frontend will be created
  # module.app.docker_network.main will be created
Plan: 3 to add, 0 to change, 3 to destroy.
```

**Note:** Taking the moved blocks away is a breaking change for every state that has not applied them yet.

## Step 10

**Command**

```sh
terraform apply -auto-approve   (the teammate) ; docker ps
```

**Output**

```text
module.app.docker_network.main: Creating...
docker_container.web: Destroying... [id=a7eabde48a5f5c5f2c6e054010518d44981dc4d73485f9600c40310487b5a280]
docker_container.cache: Destroying... [id=43d5df39e385b4e4d0a56c3ba7a4d05bf5129c431f3d66c7bfd30345a796cbde]
docker_container.cache: Destruction complete after 1s
docker_container.web: Destruction complete after 1s
docker_network.net: Destroying... [id=df527b409fb14860c310d3eab0c289783268354e43bb329c2ee4503c1e1ba64e]
docker_network.net: Destruction complete after 2s
Error: Unable to create network: Error response from daemon: network with name tfc-c12-net already exists
containers still running: 0
```

**Note:** The old containers are gone. Terraform destroyed them while it tried to create the same names again.
