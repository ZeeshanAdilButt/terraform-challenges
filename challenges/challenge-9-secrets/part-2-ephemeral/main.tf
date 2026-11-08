terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.9"
    }
  }
}

# A password Terraform generates. As a resource, its value is saved in state.
resource "random_password" "db" {
  length  = 16
  special = false
}

# Stands in for "hand the secret to the system that needs it" (a secrets manager, a database, an API).
# The command reads the password from stdin and writes it to vault.out in this folder.
# It also adds a line to runs.log each time Terraform runs it, so you can count the runs.
ephemeral "local_command" "store" {
  command   = "sh"
  arguments = ["-c", "echo run >> runs.log; cat > vault.out"]
  stdin     = random_password.db.result
}

# A normal managed resource, so the state is not empty.
resource "terraform_data" "marker" {
  input = "deployed"
}
