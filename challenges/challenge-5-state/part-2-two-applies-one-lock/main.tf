# One slow resource: it takes 25 seconds to create, like a real change that takes a while.
# The state is kept by an HTTP state server that run.mjs starts on your machine. The settings
# for it are in backend.hcl.
terraform {
  required_providers {
    time = {
      source  = "hashicorp/time"
      version = "~> 0.14"
    }
  }

  backend "http" {}
}

resource "time_sleep" "slow" {
  create_duration = "25s"
}
