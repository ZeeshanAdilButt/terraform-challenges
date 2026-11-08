# Results: Challenge 3, part 1: count and the index shift

Recorded run. Machine: win32, Docker Desktop, runner mode docker, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply -auto-approve   (five names: alpha, bravo, charlie, delta, echo)
```

**Output**

```text
Apply complete! Resources: 5 added, 0 changed, 0 destroyed.
files in out/: item-0.txt item-1.txt item-2.txt item-3.txt item-4.txt
```

**Note:** Five resources, addressed local_file.item[0] to local_file.item[4]. With count, the address is the position in the list. The name is only a value inside.

## Step 2

**Command**

```sh
terraform plan -var 'names=["bravo","charlie","delta","echo"]'   (remove "alpha", the first name; resource lines and the Plan line)
```

**Output**

```text
  # local_file.item[0] must be replaced
  # local_file.item[1] must be replaced
  # local_file.item[2] must be replaced
  # local_file.item[3] must be replaced
  # local_file.item[4] will be destroyed
Plan: 4 to add, 0 to change, 5 to destroy.
Your prediction: 4 add, 0 change, 5 destroy
Result: matches
```

**Note:** Every name moved one position to the left. Position 0 now holds "bravo", so item[0] gets new content and is replaced; the same for 1, 2 and 3. Position 4 has no name any more and is destroyed.

## Step 3

**Command**

```sh
terraform plan -var 'names=["alpha","bravo","delta","echo"]'   (remove "charlie", the middle name; resource lines and the Plan line)
```

**Output**

```text
  # local_file.item[2] must be replaced
  # local_file.item[3] must be replaced
  # local_file.item[4] will be destroyed
Plan: 2 to add, 0 to change, 3 to destroy.
Your prediction: 2 add, 0 change, 3 destroy
Result: matches
```

**Note:** Positions 0 and 1 are unchanged. "delta" moved into position 2 and "echo" into position 3, so those two are replaced. Position 4 is destroyed. You asked to remove one file and Terraform destroys three.

## Step 4

**Command**

```sh
terraform plan -var 'names=["alpha","bravo","charlie","delta"]'   (remove "echo", the last name; resource lines and the Plan line)
```

**Output**

```text
  # local_file.item[4] will be destroyed
Plan: 0 to add, 0 to change, 1 to destroy.
Your prediction: 0 add, 0 change, 1 destroy
Result: matches
```

**Note:** Nothing moved. Only the last position goes. Removing from the end of a count list is the one safe edit.

## Step 5

**Command**

```sh
terraform plan -var 'names=["echo","delta","charlie","bravo","alpha"]'   (reverse the order of the five names; resource lines and the Plan line)
```

**Output**

```text
  # local_file.item[0] must be replaced
  # local_file.item[1] must be replaced
  # local_file.item[3] must be replaced
  # local_file.item[4] must be replaced
Plan: 4 to add, 0 to change, 4 to destroy.
```

**Note:** Same names, new order, and four of five are replaced. For count, order is identity.

## Step 6

**Command**

```sh
terraform plan -var 'names=["zulu","alpha","bravo","charlie","delta","echo"]'   (insert "zulu" in front of the five names; resource lines and the Plan line)
```

**Output**

```text
  # local_file.item[0] must be replaced
  # local_file.item[1] must be replaced
  # local_file.item[2] must be replaced
  # local_file.item[3] must be replaced
  # local_file.item[4] must be replaced
  # local_file.item[5] will be created
Plan: 6 to add, 0 to change, 5 to destroy.
```

**Note:** Adding at the front shifts everything: five replaced and one new.

## Step 7

**Command**

```sh
terraform apply -auto-approve -var 'names=["alpha","bravo","delta","echo"]'   (remove "charlie" for real)
```

**Output**

```text
local_file.item[3]: Destroying... [id=dcb9fd0bddf1bb4c3d3dfb67034281002ac651b8]
local_file.item[4]: Destroying... [id=8ada6e8801c36335f6afc6af7a8c39342751d055]
local_file.item[2]: Destroying... [id=4579f95a480b2267dc7c74fae50da2d5408c6638]
local_file.item[2]: Creating...
local_file.item[3]: Creating...
Apply complete! Resources: 2 added, 0 changed, 3 destroyed.
files in out/: item-0.txt item-1.txt item-2.txt item-3.txt
```

**Note:** The three destroys and two creates really happen. The files were rewritten: with real resources (a database, a container), this is data loss and downtime for things you meant to keep.
