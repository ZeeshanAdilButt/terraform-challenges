# The code as it was last spring: two providers pinned to the exact versions the team had then.
terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "3.1.3"
    }
    local = {
      source  = "hashicorp/local"
      version = "2.1.0"
    }
  }
}
