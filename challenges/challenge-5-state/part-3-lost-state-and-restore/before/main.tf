# Not for editing. This is the configuration as it was on day 1. run.mjs applies it first.
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

resource "docker_container" "app" {
  name        = "tfc-c5-app"
  image       = "alpine:3.23"
  command     = ["sleep", "600"]
  memory      = 64
  memory_swap = 64

  labels {
    label = "tfc.challenge"
    value = "5"
  }
}
