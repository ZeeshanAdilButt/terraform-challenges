# Results: Challenge 12, part 3: removed blocks and state rm

Recorded run. Machine: Windows 11, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply   (the OLD code: before/main.tf, network, web and cache)
```

**Output**

```text
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
docker_container.cache
docker_container.web
docker_network.net
```

**Note:** Three objects exist and all three are in the state.

## Step 2

**Command**

```sh
terraform plan   (main.tf without the cache block, no removed block)
```

**Output**

```text
  # docker_container.cache will be destroyed
  # (because docker_container.cache is not in configuration)
Plan: 0 to add, 0 to change, 1 to destroy.
```

**Note:** Deleting a block is a request to destroy the object. That is what Terraform has always done, and a removed block must be deliberate about it.

## Step 3

**Command**

```sh
terraform plan   (removed { from = docker_container.cache } and nothing else)
```

**Output**

```text
  # docker_container.cache will be destroyed
  # (because docker_container.cache is not in configuration)
Plan: 0 to add, 0 to change, 1 to destroy.
```

**Note:** A removed block on its own still destroys. The safe part is the lifecycle block with destroy = false.

## Step 4

**Command**

```sh
terraform plan   (your removed.tf)
```

**Output**

```text
 # docker_container.cache will no longer be managed by Terraform, but will not be destroyed
Plan: 0 to add, 0 to change, 0 to destroy.
Warning: Some objects will no longer be managed by Terraform
 - docker_container.cache
```

**Note:** The plan to aim for: nothing to add, change or destroy, and a warning that one object will stop being tracked.

## Step 5

**Command**

```sh
terraform apply -auto-approve ; terraform state list ; docker ps
```

**Output**

```text
Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
docker_container.web
docker_network.net
docker ps: tfc-c12-cache tfc-c12-web
```

**Note:** The cache container is gone from the state and still runs. Terraform will never touch it again, unless you import it.

## Step 6

**Command**

```sh
terraform plan
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
```

**Note:** The removed block has done its work.

## Step 7

**Command**

```sh
terraform state rm docker_container.web ; terraform plan
```

**Output**

```text
Removed docker_container.web
Successfully removed 1 resource instance(s).
  # docker_container.web will be created
Plan: 1 to add, 0 to change, 0 to destroy.
```

**Note:** state rm forgets the object at once, with no plan and no record in the code. The block is still in main.tf, so Terraform now wants to create a container that already exists.

## Step 8

**Command**

```sh
terraform apply -auto-approve
```

**Output**

```text
docker_container.web: Creating...
Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c12-web" is already in use by container "211ba352ab3a806c680d0e9fd75cca88150472853e3bfb9b602ea038fe6a655f". You have to remove (or rename) that container to be able to reuse that name.
```

**Note:** The name is taken by the container Terraform just forgot. The apply fails and changes nothing. With state rm the code must be changed too, in the same pull request.

## Step 9

**Command**

```sh
terraform plan   (the web block deleted from main.tf as well)
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
docker ps: tfc-c12-cache tfc-c12-web
```

**Note:** Both containers run, and Terraform manages only the network.
