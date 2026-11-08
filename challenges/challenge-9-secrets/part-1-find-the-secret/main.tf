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

# The caller passes this one in: TF_VAR_db_password. Marking it sensitive hides it in the CLI output.
variable "db_password" {
  description = "Database password given by the caller."
  type        = string
  sensitive   = true
}

# This one Terraform makes itself.
resource "random_password" "api" {
  length  = 16
  special = false
}

# A config file for the app. It needs both secrets.
resource "local_file" "app_conf" {
  filename = "${path.module}/app.conf"
  content  = "db_password=${var.db_password}\napi_key=${random_password.api.result}\n"
}

output "db_password" {
  value     = var.db_password
  sensitive = true
}

output "api_key" {
  value     = random_password.api.result
  sensitive = true
}
