# Results: Challenge 5, part 1: state commands

Recorded run. Machine: win32, reference solution, Node 22.22.2, TFC_MODE=docker. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply -auto-approve     (last month's configuration)
```

**Output**

```text
terraform_data.build: Creating...
terraform_data.build: Creation complete after 0s [id=d9fc73ad-1417-0f65-4968-8ee847a1a1eb]
local_file.legacy: Creation complete after 0s [id=83d67d861d096656bde1d9f752ae28032409d664]
local_file.notes: Creation complete after 0s [id=58d71fa12deadd0b2abf42d357f7ef6f754eba21]
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
```

**Note:** Three resources, three entries in the state.

## Step 2

**Command**

```sh
terraform state list
```

**Output**

```text
local_file.legacy
local_file.notes
terraform_data.build
```

**Note:** The address of a resource is its type and its name. This is what state commands take as arguments.

## Step 3

**Command**

```sh
terraform state show local_file.notes
```

**Output**

```text
# local_file.notes:
resource "local_file" "notes" {
    content              = <<-EOT
        team notes
    EOT
    directory_permission = "0777"
    file_permission      = "0777"
    filename             = "./out/notes.txt"
    id                   = "58d71fa12deadd0b2abf42d357f7ef6f754eba21"
}
```

**Note:** What the state remembers about one resource (hash lines left out here). Read only; it changes nothing.

## Step 4

**Command**

```sh
terraform plan     (this month's configuration, state still old)
```

**Output**

```text
  # local_file.legacy will be destroyed
  # local_file.notes will be destroyed
  # local_file.readme will be created
Plan: 1 to add, 0 to change, 2 to destroy.
```

**Note:** Terraform sees notes and legacy in the state with no code, and readme in the code with no state. It plans to destroy two things and create one. The file legacy.txt would be deleted.

## Step 5

**Command**

```sh
your commands, from commands.txt
```

**Output**

```text
$ terraform state mv local_file.notes local_file.readme
Move "local_file.notes" to "local_file.readme"
Successfully moved 1 object(s).
$ terraform state rm local_file.legacy
Removed local_file.legacy
Successfully removed 1 resource instance(s).
```

**Note:** Each command rewrites the state file and keeps the version before it in terraform.tfstate.backup.

## Step 6

**Command**

```sh
terraform plan
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
```

**Note:** No changes. The state now matches the new code, and nothing was created or destroyed in the real world.

## Step 7

**Command**

```sh
ls out/ ; ls terraform.tfstate* (with the serial and the resources inside each file)
```

**Output**

```text
out/: notes.txt legacy.txt
terraform.tfstate.1794157320.backup  serial 4: local_file.legacy, local_file.notes, terraform_data.build
terraform.tfstate.1794157324.backup  serial 5: local_file.legacy, local_file.readme, terraform_data.build
terraform.tfstate  serial 6: local_file.readme, terraform_data.build
```

**Note:** state rm only forgets: legacy.txt is still on disk. Every state command that changes the state first saves the old one as terraform.tfstate.<number>.backup. That is your undo. (The number differs on every run.)
