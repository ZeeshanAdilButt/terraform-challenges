# Results: Challenge 3, part 2: for_each keys

Recorded run. Machine: win32, Docker Desktop, runner mode docker, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply -auto-approve   (five names and three sites)
```

**Output**

```text
Apply complete! Resources: 8 added, 0 changed, 0 destroyed.
out/:   alpha.txt bravo.txt charlie.txt delta.txt echo.txt
sites/: api.conf docs.conf web.conf
```

**Note:** Eight resources. Their addresses are now local_file.item["alpha"], local_file.item["bravo"] ... and local_file.site["web"], ... The key is the address.

## Step 2

**Command**

```sh
terraform plan -var 'names=["bravo","charlie","delta","echo"]'   (remove "alpha", the first name)
```

**Output**

```text
  # local_file.item["alpha"] will be destroyed
Plan: 0 to add, 0 to change, 1 to destroy.
```

**Note:** The names are the addresses, so "alpha" has its own address and nothing else moves. One destroy.

## Step 3

**Command**

```sh
terraform plan -var 'names=["alpha","bravo","delta","echo"]'   (remove "charlie", the middle name)
```

**Output**

```text
  # local_file.item["charlie"] will be destroyed
Plan: 0 to add, 0 to change, 1 to destroy.
```

**Note:** Only local_file.item["charlie"] goes. Everything else keeps its address, so nothing is replaced. This is the edit that cost three destroys with count.

## Step 4

**Command**

```sh
terraform plan -var 'names=["alpha","bravo","charlie","delta"]'   (remove "echo", the last name)
```

**Output**

```text
  # local_file.item["echo"] will be destroyed
Plan: 0 to add, 0 to change, 1 to destroy.
```

**Note:** One destroy, as with count.

## Step 5

**Command**

```sh
terraform plan -var 'names=["echo","delta","charlie","bravo","alpha"]'   (reverse the order of the five names)
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
```

**Note:** Order does not matter to a set. The plan says No changes. With count the same edit replaced four files.

## Step 6

**Command**

```sh
terraform plan -var 'names=["zulu","alpha","bravo","charlie","delta","echo"]'   (insert "zulu" in front of the five names)
```

**Output**

```text
  # local_file.item["zulu"] will be created
Plan: 1 to add, 0 to change, 0 to destroy.
```

**Note:** One new address, one add, nothing else touched.

## Step 7

**Command**

```sh
terraform apply -auto-approve -var 'names=["alpha","bravo","delta","echo"]'   (remove "charlie" for real)
```

**Output**

```text
local_file.item["charlie"]: Destroying... [id=4579f95a480b2267dc7c74fae50da2d5408c6638]
Apply complete! Resources: 0 added, 0 changed, 1 destroyed.
out/: alpha.txt bravo.txt delta.txt echo.txt
```

**Note:** One file destroyed, the other four untouched.

## Step 8

**Command**

```sh
terraform plan -var 'sites=...'   (change the port of "api" from 8080 to 9090)
```

**Output**

```text
  # local_file.site["api"] must be replaced
Plan: 1 to add, 0 to change, 1 to destroy.
```

**Note:** Only the site whose value changed is touched, and it is replaced because the file content changed. The other sites and all the item files are not listed.

## Step 9

**Command**

```sh
terraform plan -var 'sites=...'   (remove the site "web")
```

**Output**

```text
  # local_file.site["web"] will be destroyed
Plan: 0 to add, 0 to change, 1 to destroy.
```

**Note:** Removing a key removes that one address.

## Step 10

**Command**

```sh
terraform plan -var 'sites=...'   (add a site "blog")
```

**Output**

```text
  # local_file.site["blog"] will be created
Plan: 1 to add, 0 to change, 0 to destroy.
```

**Note:** A new key is one add. Nothing else moves.

## Step 11

**Command**

```sh
terraform plan   (demo: for_each = toset(random_pet.app[*].id), keys known only after apply)
```

**Output**

```text
Plan: 2 to add, 0 to change, 0 to destroy.
Error: Invalid for_each argument

  on main.tf line 11, in resource "local_file" "pet_file":
  11:   for_each = toset(random_pet.app[*].id)
    ├────────────────
    │ random_pet.app is tuple with 2 elements

The "for_each" set includes values derived from resource attributes that
cannot be determined until apply, and so Terraform cannot determine the full
set of keys that will identify the instances of this resource.

When working with unknown values in for_each, it's better to use a map value
where the keys are defined statically in your configuration and where only
the values contain apply-time results.

Alternatively, you could use the -target planning option to first apply only
the resources that the for_each value depends on, and then apply a second
time to fully converge.
```

**Note:** Terraform has to know the KEYS of a for_each at plan time, to know how many resources and which addresses. The pet names are only known after the pets are created, so it cannot plan. Keep unknown things as values and write the keys yourself.

## Step 12

**Command**

```sh
terraform plan   (your unknown-keys/main.tf)
```

**Output**

```text
  # local_file.pet_file["first"] will be created
  # local_file.pet_file["second"] will be created
  # random_pet.app[0] will be created
  # random_pet.app[1] will be created
Plan: 4 to add, 0 to change, 0 to destroy.
```

**Note:** With the keys written in the configuration (first, second) and only the values unknown, the plan works: two pets and two files.
