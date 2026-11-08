# The root of the tests. `terraform test` runs from this folder (capstone/) and its run blocks name the module
# they test. Terraform needs to know which "docker" provider the tests mock, and this file says so.
# The module has its own versions.tf. Keep the two version ranges the same.

terraform {
  required_version = ">= 1.17"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}
