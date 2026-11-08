# Results: Challenge 2, part 2: outputs and sensitive values

Recorded run. Machine: win32, Docker Desktop, runner mode docker, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform plan   (a separate demo: an output of a sensitive variable, without sensitive = true)
```

**Output**

```text
Error: Output refers to sensitive values

  on main.tf line 6:
   6: output "token_echo" {

To reduce the risk of accidentally exporting sensitive data that was intended
to be only internal, Terraform requires that any root module output
containing sensitive data be explicitly marked as sensitive, to confirm your
intent.

If you do intend to export this data, annotate the output value as sensitive
by adding the following argument:
    sensitive = true
```

**Note:** Terraform refuses to plan. An output is meant to be read by people and other tools, so it must say, in writing, that it is sensitive. This is the error your starter main.tf gives you too.

## Step 2

**Command**

```sh
terraform apply -auto-approve   (your main.tf, lines from "Changes to Outputs")
```

**Output**

```text
Changes to Outputs:
  + db_password  = (sensitive value)
  + service_name = "demo"
  + token_length = (sensitive value)
terraform_data.service: Creating...
terraform_data.service: Creation complete after 0s [id=4c67de5d-3746-48b2-67f8-7ea9c9e79104]
random_password.db: Creating...
random_password.db: Creation complete after 0s [id=none]

Apply complete! Resources: 2 added, 0 changed, 0 destroyed.

Outputs:

db_password = <sensitive>
service_name = "demo"
token_length = <sensitive>
```

**Note:** Terraform prints <sensitive> instead of the values, in the plan part and in the final outputs. The password was generated, so it did not exist in any file you wrote.

## Step 3

**Command**

```sh
terraform output ; terraform output db_password ; terraform output -raw db_password
```

**Output**

```text
$ terraform output
db_password = <sensitive>
service_name = "demo"
token_length = <sensitive>
$ terraform output db_password
"ln69UJke6aI87bu5"
$ terraform output -raw db_password
ln69UJke6aI87bu5
```

**Note:** The list hides sensitive outputs. Asking for one by name, or with -raw, prints it: the mark only stops accidents on screen, it does not lock anything.

## Step 4

**Command**

```sh
terraform output -json   (the db_password entry)
```

**Output**

```text
{
  "db_password": {
    "sensitive": true,
    "type": "string",
    "value": "ln69UJke6aI87bu5"
  }
}
```

**Note:** JSON output has a "sensitive": true flag for programs to read, and the plain value next to it. Anyone who can run this command can read the secret.

## Step 5

**Command**

```sh
terraform show   (the password line and the terraform_data block)
```

**Output**

```text
    result      = (sensitive value)
# terraform_data.service:
resource "terraform_data" "service" {
    id     = "4c67de5d-3746-48b2-67f8-7ea9c9e79104"
    input  = {
        name  = "demo"
        token = (sensitive value)
    }
    output = {
        name  = "demo"
        token = "tfc-demo-token-not-real"
    }
}
```

**Note:** show hides the password, and hides the token in "input". But the same token appears in plain text in the "output" attribute of terraform_data. A sensitive mark follows a value through expressions, not through every attribute a provider fills in.

## Step 6

**Command**

```sh
grep the state file for the password and for the token
```

**Output**

```text
terraform.tfstate line 8: "value": "ln69UJke6aI87bu5",
password appears 2 time(s) in terraform.tfstate
terraform.tfstate line 79: "token": "tfc-demo-token-not-real"
token appears 2 time(s) in terraform.tfstate
```

**Note:** State is a plain JSON file. Marking a value sensitive hides it on screen; it stays in state in clear text. That is why state files need the care you give a password file.
