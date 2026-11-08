# Results: Challenge 12, part 1: adopt hand-built containers with import blocks

Recorded run. Machine: Windows 11, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
docker network create ... ; docker run -d ... nginx ; docker run -d ... alpine sleep
```

**Output**

```text
network   tfc-c12-net  bridge
container tfc-c12-cache  alpine:3.23  Up 1 second
container tfc-c12-web  nginx:1.27-alpine  Up 2 seconds
web id   73c880be5a39...
cache id 2d9e3be130d3...
```

**Note:** Three objects exist and no Terraform file describes them. The docker command printed the long ids; Terraform will need them.

## Step 2

**Command**

```sh
terraform init
```

**Output**

```text
- Installing kreuzwerker/docker v4.6.0...
Terraform has been successfully initialized!
```

**Note:** Same provider pin as every challenge.

## Step 3

**Command**

```sh
terraform plan   (import block with id = "tfc-c12-web")
```

**Output**

```text
Error: Cannot import non-existent remote object
While attempting to import an existing object to "docker_container.web", the
provider detected that no object exists with the given id. Only pre-existing
```

**Note:** A container is named tfc-c12-web, and the plan says no such object exists. The provider wants the long container id, not the name.

## Step 4

**Command**

```sh
terraform plan -generate-config-out=generated.tf
```

**Output**

```text
Plan: 3 to import, 2 to add, 0 to change, 2 to destroy.
Warning: Config generation is experimental
generated.tf: 146 lines, 41 of them set an argument to null
```

**Note:** Terraform wrote a draft for all three objects. It is a draft: the plan for the draft, in the next step, shows what is wrong with it.

## Step 5

**Command**

```sh
terraform plan   (the generated draft, untouched)
```

**Output**

```text
  # docker_container.cache must be replaced
      + env                                         = (known after apply) # forces replacement
  # docker_container.web must be replaced
      + env                                         = (known after apply) # forces replacement
  # docker_network.net will be imported
Plan: 3 to import, 2 to add, 0 to change, 2 to destroy.
```

**Note:** Importing is not enough. The draft replaces both containers. The line that says why: env is not set, and a changed env forces a replacement.

## Step 6

**Command**

```sh
terraform plan   (starter containers.tf: networks_advanced, labels, no env)
```

**Output**

```text
  # docker_container.cache must be replaced
      + env                                         = (known after apply) # forces replacement
      ~ network_mode                                = "tfc-c12-net" -> "bridge" # forces replacement
      + labels { # forces replacement
      + networks_advanced { # forces replacement
  # docker_container.web must be replaced
      + env                                         = (known after apply) # forces replacement
      ~ network_mode                                = "tfc-c12-net" -> "bridge" # forces replacement
      + labels { # forces replacement
      + networks_advanced { # forces replacement
Plan: 3 to import, 2 to add, 0 to change, 2 to destroy.
```

**Note:** The configuration a person writes from the docker command is worse than the draft: the labels and the network block each force a replacement too.

## Step 7

**Command**

```sh
terraform plan   (your imports.tf and containers.tf)
```

**Output**

```text
  # docker_container.cache will be updated in-place
  # docker_container.web will be updated in-place
  # docker_network.net will be imported
Plan: 3 to import, 0 to add, 2 to change, 0 to destroy.
```

**Note:** The plan to aim for: three imports, nothing to add, nothing to destroy. The in-place changes are the provider filling in arguments that exist only in its own state (attach, logs, must_run, start, wait).

## Step 8

**Command**

```sh
terraform apply -auto-approve
```

**Output**

```text
docker_container.cache: Import complete [id=2d9e3be130d3344d66120d2262b165bd52254f3bdb410850e6d6b78404c5b336]
docker_container.web: Import complete [id=73c880be5a394635cb55864e5b289831abd3edd605c59840d5351376d3b092f4]
docker_network.net: Import complete [id=tfc-c12-net]
docker_container.web: Modifications complete after 0s [id=73c880be5a394635cb55864e5b289831abd3edd605c59840d5351376d3b092f4]
docker_container.cache: Modifications complete after 0s [id=2d9e3be130d3344d66120d2262b165bd52254f3bdb410850e6d6b78404c5b336]
Apply complete! Resources: 3 imported, 0 added, 2 changed, 0 destroyed.
```

**Note:** The imports and the two in-place changes only write to the state. Docker is not asked to change anything.

## Step 9

**Command**

```sh
docker inspect (id and StartedAt of both containers, before and after the apply)
```

**Output**

```text
web    id 73c880be5a39 -> 73c880be5a39   started 2026-11-08T18:25:16.67374047Z -> 2026-11-08T18:25:16.67374047Z
cache  id 2d9e3be130d3 -> 2d9e3be130d3   started 2026-11-08T18:25:17.72088447Z -> 2026-11-08T18:25:17.72088447Z
```

**Note:** Same id and same start time: the containers were adopted, not recreated.

## Step 10

**Command**

```sh
terraform plan
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
```

**Note:** Nothing left to do: the code, the state and Docker agree.

## Step 11

**Command**

```sh
terraform state list
```

**Output**

```text
docker_container.cache
docker_container.web
docker_network.net
```

**Note:** All three objects are in the state now, with the addresses of your configuration.
