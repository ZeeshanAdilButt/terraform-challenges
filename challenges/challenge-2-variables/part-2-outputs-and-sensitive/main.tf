# Challenge 2, part 2: outputs and sensitive values.
# The plan fails. Read the error, fix the two outputs, run again.
# run.mjs gives api_token a made-up value through TF_VAR_api_token. Never put a real token in a challenge.

terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

variable "api_token" {
  type        = string
  sensitive   = true
  description = "A made-up token. sensitive = true hides it in plan and apply output."
}

# A generated password. The provider marks its result as sensitive.
resource "random_password" "db" {
  length  = 16
  special = false
}

# terraform_data is built into Terraform. It keeps whatever you give it as "input".
resource "terraform_data" "service" {
  input = {
    name  = "demo"
    token = var.api_token
  }
}

output "service_name" {
  value = terraform_data.service.input.name
}

output "db_password" {
  value = random_password.db.result
}

output "token_length" {
  value = length(var.api_token)
}
