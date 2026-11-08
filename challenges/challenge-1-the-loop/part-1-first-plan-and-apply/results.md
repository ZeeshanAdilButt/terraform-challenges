# Results: Challenge 1, part 1: first plan and apply

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, runner mode docker, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform init
```

**Output**

```text
Initializing provider plugins...
- Reusing version 2.9.1 of hashicorp/local from the dependency lock file
- Reusing version 4.6.0 of kreuzwerker/docker from the dependency lock file
- Reusing version 3.9.1 of hashicorp/random from the dependency lock file
- Using hashicorp/local v2.9.1 from the shared cache directory
- Using kreuzwerker/docker v4.6.0 from the shared cache directory
- Using hashicorp/random v3.9.1 from the shared cache directory

Terraform has been successfully initialized!
```

**Note:** init installs the three providers (docker, random, local) and checks each against the lock file that comes with this part.

## Step 2

**Command**

```sh
terraform plan   (lines that name a resource, and the Plan line)
```

**Output**

```text
  # docker_container.sleeper will be created
  # docker_image.alpine will be created
  # local_file.greeting will be created
  # random_pet.name will be created
Plan: 4 to add, 0 to change, 0 to destroy.
```

**Note:** Nothing exists yet, so every resource is "will be created". The plan changes nothing; it only predicts.

## Step 3

**Command**

```sh
terraform apply -auto-approve   (without the plan text)
```

**Output**

```text
random_pet.name: Creating...
random_pet.name: Creation complete after 0s [id=ultimate-spider]
docker_image.alpine: Creating...
local_file.greeting: Creating...
local_file.greeting: Creation complete after 0s [id=859d5c425031c24f9a8d4fd12972b5e9dca4c2d8]
docker_image.alpine: Creation complete after 2s [id=sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2alpine:3.23]
docker_container.sleeper: Creating...
docker_container.sleeper: Creation complete after 2s [id=ed49083f29c6709f9cf2fb4d3a141eac27dc2ab34a1a5428aea21d1a11330dc2]

Apply complete! Resources: 4 added, 0 changed, 0 destroyed.
```

**Note:** apply repeats the plan, then does it. Terraform orders the work itself: the image and the pet first, the container last, because the container needs the image.

## Step 4

**Command**

```sh
docker ps --filter label=tfc.challenge=1
```

**Output**

```text
tfc-c1-sleeper	469c9ea410b9	"sleep 3600"	Up 59 seconds
```

**Note:** The container exists, is running, and carries the label cleanup uses.

## Step 5

**Command**

```sh
cat greeting.txt
```

**Output**

```text
hello from ultimate-spider
```

**Note:** The file Terraform made. The random pet name is different on every machine.

## Step 6

**Command**

```sh
terraform plan   (the second plan, nothing edited)
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
```

**Note:** No changes. The real world matches the configuration, and Terraform proves it by reading every resource again.

## Step 7

**Command**

```sh
terraform state list
```

**Output**

```text
docker_container.sleeper
docker_image.alpine
local_file.greeting
random_pet.name
```

**Note:** State is the list of what Terraform made. Each name is an address: type.name.

## Step 8

**Command**

```sh
terraform destroy -auto-approve   (without the plan text)
```

**Output**

```text
local_file.greeting: Destroying... [id=859d5c425031c24f9a8d4fd12972b5e9dca4c2d8]
docker_container.sleeper: Destroying... [id=ed49083f29c6709f9cf2fb4d3a141eac27dc2ab34a1a5428aea21d1a11330dc2]
local_file.greeting: Destruction complete after 0s
random_pet.name: Destroying... [id=ultimate-spider]
random_pet.name: Destruction complete after 0s
docker_container.sleeper: Destruction complete after 1s
docker_image.alpine: Destroying... [id=sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2alpine:3.23]
docker_image.alpine: Destruction complete after 0s

Destroy complete! Resources: 4 destroyed.
```

**Note:** destroy removed 4 resources. alpine:3.23 is still on this machine, because keep_locally = true.
