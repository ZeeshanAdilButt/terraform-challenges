# Results: Challenge 7, part 1: build a module and call it for two environments

Recorded run. Machine: win32, runner docker, Terraform 1.17.1 in the pinned image, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform init
```

**Output**

```text
Initializing modules...
- app in modules/app-container
Terraform has been successfully initialized!
```

**Note:** init installs the module (a local folder, so nothing is downloaded for it) and the Docker provider.

## Step 2

**Command**

```sh
terraform plan -out=tfplan
```

**Output**

```text
  # docker_image.alpine will be created
  # docker_network.env["dev"] will be created
  # docker_network.env["prod"] will be created
  # module.app["dev"].docker_container.this will be created
  # module.app["prod"].docker_container.this will be created
Plan: 5 to add, 0 to change, 0 to destroy.
```

**Note:** One image, two networks (one per environment) and two containers, one per module instance.

## Step 3

**Command**

```sh
terraform apply tfplan
```

**Output**

```text
docker_network.env["prod"]: Creation complete after 3s [id=...]
docker_network.env["dev"]: Creation complete after 3s [id=...]
docker_image.alpine: Creation complete after 3s [id=sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2alpine:3.23]
module.app["prod"].docker_container.this: Creation complete after 3s [id=...]
module.app["dev"].docker_container.this: Creation complete after 3s [id=...]
Apply complete! Resources: 5 added, 0 changed, 0 destroyed.
```

**Note:** Two instances of one module, each with its own container name.

## Step 4

**Command**

```sh
terraform output -json apps
```

**Output**

```text
{
  "dev": {
    "container_name": "tfc-c7-dev-app",
    "ip_address": "172.30.0.2",
    "network_name": "tfc-c7-dev-net"
  }
}
```

**Note:** A module's outputs are its interface: container_name, ip_address, network_name. Nothing else gets out.

## Step 5

**Command**

```sh
TF_VAR_environments='{ qa = { memory_mb = 64 } }' terraform plan
```

**Output**

```text
Error: Invalid value for variable
environment must be one of: dev, staging, prod.
```

**Note:** The module refuses an environment it does not know, before anything changes.

## Step 6

**Command**

```sh
TF_VAR_environments='{ dev = { memory_mb = 4096 } }' terraform plan
```

**Output**

```text
Error: Invalid value for variable
memory_mb must be between 16 and 256.
```

**Note:** The module refuses a memory limit outside its range.

## Step 7

**Command**

```sh
terraform plan -detailed-exitcode
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
```

**Note:** Exit code 0: 0 means nothing to do.

## Step 8

**Command**

```sh
terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 5 destroyed.
```

**Note:** The two containers, two networks and the image resource go. The image itself stays on your machine (keep_locally).

## Step 9

**Command**

```sh
add provider "docker" { host = ... } inside the module, then terraform init
```

**Output**

```text
Error: Module is incompatible with count, for_each, and depends_on
The module at module.app is a legacy module which contains its own local
provider configurations, and so calls to it may not use the count, for_each,
or depends_on arguments.
```

**Note:** A provider block inside a module hides a setting from the caller and makes the module unusable with for_each, count and depends_on.

## Step 10

**Command**

```sh
delete versions.tf from the module, then terraform init
```

**Output**

```text
- Finding latest version of hashicorp/docker...
Error: Failed to query available provider packages
Could not retrieve the list of available versions for provider
hashicorp/docker: provider registry registry.terraform.io does not have a
provider named registry.terraform.io/hashicorp/docker
Did you intend to use kreuzwerker/docker? If so, you must specify that source
address in each module which requires that provider. To see which modules are
currently depending on hashicorp/docker, run the following command:
```

**Note:** A module must say which provider it needs. Without that, Terraform looks for hashicorp/docker, which does not exist.

## Step 11

**Command**

```sh
node toolkit/cleanup.mjs 7
```

**Output**

```text
Still labelled tfc.challenge=7: 0 containers, 0 networks, 0 volumes.
```

**Note:** Everything this part made is gone. The alpine image stays.
