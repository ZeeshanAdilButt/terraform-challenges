# The constraints today. They say "this version or anything newer": the next `terraform init -upgrade` takes
# whatever the registry has, including a new major version one day. Pin them to a range you have tested.
terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = ">= 3.1"
    }
    local = {
      source  = "hashicorp/local"
      version = ">= 2.1"
    }
  }
}
