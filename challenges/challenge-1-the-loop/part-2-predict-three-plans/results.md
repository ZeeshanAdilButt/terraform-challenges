# Results: Challenge 1, part 2: predict three plans

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, runner mode docker, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply -auto-approve   (the baseline in main.tf)
```

**Output**

```text
Apply complete! Resources: 4 added, 0 changed, 0 destroyed.
```

**Note:** Four resources exist: a pet name, a greeting file, an image and a container. Now we change one thing at a time and only plan.

## Step 2

**Command**

```sh
edit 1: container restart policy "no" -> "on-failure"; then terraform plan   (resource lines and the Plan line)
```

**Output**

```text
  # docker_container.sleeper will be updated in-place
Plan: 0 to add, 1 to change, 0 to destroy.
Your prediction: 0 add, 1 change, 0 destroy, touches ["docker_container.sleeper"]
Result: matches
```

**Note:** One line says "will be updated in-place": Terraform changes the same container. No add and no destroy.

## Step 3

**Command**

```sh
edit 2: greeting text "hello from" -> "hi from"; then terraform plan   (resource lines and the Plan line)
```

**Output**

```text
  # local_file.greeting must be replaced
      ~ content              = <<-EOT # forces replacement
Plan: 1 to add, 0 to change, 1 to destroy.
Your prediction: 1 add, 0 change, 1 destroy, touches ["local_file.greeting"]
Result: matches
```

**Note:** A file content cannot be changed in place by this provider, so the plan says "must be replaced" with "forces replacement": one destroy and one add.

## Step 4

**Command**

```sh
edit 3: random_pet length 2 -> 3; then terraform plan   (resource lines and the Plan line)
```

**Output**

```text
  # local_file.greeting must be replaced
        EOT -> (known after apply) # forces replacement
  # random_pet.name must be replaced
      ~ length    = 2 -> 3 # forces replacement
Plan: 2 to add, 0 to change, 2 to destroy.
Your prediction: 2 add, 0 change, 2 destroy, touches ["local_file.greeting","random_pet.name"]
Result: matches
```

**Note:** Look at which addresses appear. The pet is replaced, and the file text is built from the pet name, so the file must be replaced too. You never edited the file.

## Step 5

**Command**

```sh
apply edit 1 for real; docker inspect the container id before and after
```

**Output**

```text
  # docker_container.sleeper will be updated in-place
Apply complete! Resources: 0 added, 1 changed, 0 destroyed.
container id before 63f40e5e4ad5
container id after  63f40e5e4ad5
```

**Note:** An update changes the same object. The container id is the same: it is the same container, changed in place.

## Step 6

**Command**

```sh
apply a fourth edit for real (container command sleep 3600 -> sleep 7200); docker inspect the container id
```

**Output**

```text
  # docker_container.sleeper must be replaced
Apply complete! Resources: 1 added, 0 changed, 1 destroyed.
container id before 63f40e5e4ad5
container id after  3befee917921
```

**Note:** A replacement destroys the old object and creates a new one. The container id changed: it is a new container, and anything inside the old one is gone.
