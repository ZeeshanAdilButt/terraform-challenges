# Results: Challenge 2, part 1: types, validation and precedence

Recorded run. Machine: win32, Docker Desktop, runner mode docker, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform console   (three expressions)
```

**Output**

```text
> type(var.replicas)
number
> type(var.ports)
list(number)
> jsonencode({ replicas = ..., ports = ..., labels = ..., limits = ... })
"{\"labels\":{\"team\":\"platform\"},\"limits\":{\"cpu\":1,\"memory_mb\":256},\"ports\":[80,443],\"replicas\":2}"
```

**Note:** replicas is a number, ports a list of numbers. The type decides what Terraform accepts and how it converts.

## Step 2

**Command**

```sh
terraform plan   (no value for project, which has no default)
```

**Output**

```text
Error: No value for required variable

  on variables.tf line 3:
   3: variable "project" {

The root module input variable "project" is not set, and has no default
value. Use a -var or -var-file command line argument to provide a value for
this variable.
```

**Note:** A variable without a default is required. Terraform never guesses it, and with no terminal (TF_INPUT=0) it does not ask: it stops.

## Step 3

**Command**

```sh
terraform plan -var project=Bad_Name  (and two more)
```

**Output**

```text
$ plan -var project=Bad_Name
(exit 1)
Error: Invalid value for variable

  on variables.tf line 3:
   3: variable "project" {
    ├────────────────
    │ var.project is "Bad_Name"

project must be 3 to 12 characters long, using lowercase letters and digits
only (for example: daftar2).

This was checked by the validation rule at variables.tf:7,3-13.
$ plan -var project=demo -var replicas=9
(exit 1)
Error: Invalid value for variable

  on variables.tf line 13:
  13: variable "replicas" {
    ├────────────────
    │ var.replicas is 9

replicas must be a whole number from 1 to 5.

This was checked by the validation rule at variables.tf:18,3-13.
```

**Note:** A validation block turns a silent mistake into an error that names the variable, the bad value and your message. It runs before anything is planned.

## Step 4

**Command**

```sh
terraform plan -var project=demo -var replicas=2.5  (and a good value)
```

**Output**

```text
$ plan -var project=demo -var replicas=2.5
(exit 1)
Error: Invalid value for variable

  on variables.tf line 13:
  13: variable "replicas" {
    ├────────────────
    │ var.replicas is 2.5

replicas must be a whole number from 1 to 5.

This was checked by the validation rule at variables.tf:18,3-13.
$ plan -var project=daftar -var replicas=3
(exit 0, accepted)
Changes to Outputs:
```

**Note:** A number type alone allows 2.5. The validation says "whole number". A good value still passes.

## Step 5

**Command**

```sh
terraform console: var.replicas + 1 with -var replicas=3 ; then plan with replicas=abc and ports=[80,"x"]
```

**Output**

```text
> var.replicas + 1   (replicas=3 given as text on the command line)
4
$ plan -var replicas=abc
Error: Invalid value for input variable

  on variables.tf line 13:
  13: variable "replicas" {

Unsuitable value for var.replicas set using -var="replicas=...": a number is
required.
$ plan -var 'ports=[80,"x"]'
Error: Invalid value for input variable

  on variables.tf line 24:
  24: variable "ports" {

Unsuitable value for var.ports set using -var="ports=...": a number is
required.
```

**Note:** Text from the command line is converted to the declared type when it can be ("3" becomes 3) and rejected when it cannot. This is the type constraint at work, not a validation block.

## Step 6

**Command**

```sh
terraform console: var.greeting   (seven duels; each source sets greeting to its own label)
```

**Output**

```text
TF_VAR_greeting versus terraform.tfvars
   you: tfvars   real: tfvars   ok
terraform.tfvars versus terraform.tfvars.json
   you: tfvars-json   real: tfvars-json   ok
terraform.tfvars versus a.auto.tfvars
   you: auto-a   real: auto-a   ok
a.auto.tfvars versus b.auto.tfvars
   you: auto-b   real: auto-b   ok
b.auto.tfvars versus -var-file=extra.tfvars
   you: var-file   real: var-file   ok
-var-file=extra.tfvars written first, then -var
   you: var   real: var   ok
-var written first, then -var-file=extra.tfvars
   you: var-file   real: var-file   ok
```

**Note:** Each duel sets only two sources and asks Terraform which value it used.

## Step 7

**Command**

```sh
terraform console: var.greeting   (add one source at a time, lowest first)
```

**Output**

```text
added default only winner: default
added env          winner: env
added tfvars       winner: tfvars
added tfvars-json  winner: tfvars-json
added auto-a       winner: auto-a
added auto-b       winner: auto-b
added var-file     winner: var-file
added var          winner: var
```

**Note:** Each newly added source wins over everything before it. This is the order, lowest to highest: default, TF_VAR_, terraform.tfvars, terraform.tfvars.json, *.auto.tfvars (alphabetical), -var-file and -var (in the order written).
