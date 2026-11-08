# Results: Challenge 0, part 1: check your toolkit

Recorded run. Machine: win32, Docker Engine 29.9.2, runner mode docker, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
node toolkit/check-setup.mjs
```

**Output**

```text
Node.js 22 or newer      ok    found 22.22.2
Docker engine reachable  ok    engine 29.9.2
Runner mode              ok    docker (hashicorp/terraform:1.17.1)
terraform runs           ok    Terraform v1.17.1
2 GB of free disk        ok    12.0 GB free
```

**Note:** No line says FAIL. The runner mode line says how Terraform will run: in the pinned container (docker) or the program on your PATH (local).

## Step 2

**Command**

```sh
terraform version
```

**Output**

```text
Terraform v1.17.1
on linux_amd64
```

**Note:** The reference runs use Terraform 1.17.1. A local program of 1.17 or newer behaves the same for these challenges.

## Step 3

**Command**

```sh
cat main.tf
```

**Output**

```text
# Challenge 0: your first Terraform configuration.

terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

# A random_pet makes a random name such as "classic-gar-heron". It creates nothing outside Terraform's own state.
resource "random_pet" "toolkit" {
  length = 3
}

output "pet" {
  value = random_pet.toolkit.id
}
```

**Note:** The whole configuration: one provider, one resource, one output.

## Step 4

**Command**

```sh
terraform init
```

**Output**

```text
Initializing the backend...

Initializing provider plugins...
- Finding hashicorp/random versions matching "~> 3.9"...
- Installing hashicorp/random v3.9.1...
- Installed hashicorp/random v3.9.1 (signed by HashiCorp)

Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.

Terraform has been successfully initialized!
```

**Note:** init downloads the provider into .terraform/ and writes .terraform.lock.hcl. The lock file records the exact provider version.

## Step 5

**Command**

```sh
terraform validate
```

**Output**

```text
Success! The configuration is valid.
```

**Note:** validate checks the syntax and the types. It does not look at real infrastructure.

## Step 6

**Command**

```sh
terraform plan
```

**Output**

```text
Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # random_pet.toolkit will be created
  + resource "random_pet" "toolkit" {
      + id        = (known after apply)
      + length    = 3
      + separator = "-"
    }

Plan: 1 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + pet = (known after apply)
```

**Note:** The plan is a prediction. Nothing exists yet, so it says what it would add.

## Step 7

**Command**

```sh
terraform apply -auto-approve
```

**Output**

```text
random_pet.toolkit: Creating...
random_pet.toolkit: Creation complete after 0s [id=actively-regular-anemone]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.

Outputs:

pet = "actively-regular-anemone"
```

**Note:** apply makes the change. The pet name is random: yours differs from the recorded one.

## Step 8

**Command**

```sh
terraform output -raw pet
```

**Output**

```text
actively-regular-anemone
```

**Note:** An output is a value Terraform prints after an apply and keeps in state.

## Step 9

**Command**

```sh
terraform destroy -auto-approve
```

**Output**

```text
random_pet.toolkit: Destroying... [id=actively-regular-anemone]
random_pet.toolkit: Destruction complete after 0s

Destroy complete! Resources: 1 destroyed.
```

**Note:** destroy removes what apply made. For random_pet that is only a record in state.
