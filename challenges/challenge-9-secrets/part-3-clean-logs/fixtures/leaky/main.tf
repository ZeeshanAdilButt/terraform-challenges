terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.9"
    }
  }
}

# The token for a deployment API. The CI job passes it as TF_VAR_api_token.
variable "api_token" {
  description = "Token the deploy step needs."
  type        = string
}

# Records that a deployment happened, and with which token.
resource "terraform_data" "deploy" {
  input = var.api_token
}

# A line for the build log.
output "deploy_hint" {
  value = "deployed with token=${var.api_token}"
}
