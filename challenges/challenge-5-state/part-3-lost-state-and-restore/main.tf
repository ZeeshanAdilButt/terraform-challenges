# Day 2: the same container, plus a small record of which release is running.
# The container is labelled tfc.challenge=5 and named tfc-c5-app, like everything in this challenge.
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

  # FIX: when you adopt this container with `terraform import` (recovery B), the Docker provider cannot
  # read some arguments back from a running container. Without a lifecycle block here, the plan after
  # the import wants to destroy and recreate the container you just adopted.
  # Run the part once, read the "forces replacement" lines of the plan after the import, then name
  # the arguments to ignore.
}

resource "terraform_data" "release" {
  input = "release-2"
}
