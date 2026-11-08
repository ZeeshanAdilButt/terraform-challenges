# Challenge 1, part 2: the baseline. This file is already correct; you do not edit it.
# run.mjs applies it once, then changes it three ways (and a fourth) and shows you the plan of each change.
# Your job is in predictions.json.

terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
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

provider "docker" {}

resource "random_pet" "name" {
  length = 2
}

resource "local_file" "greeting" {
  filename = "${path.module}/greeting.txt"
  content  = "hello from ${random_pet.name.id}\n"
}

resource "docker_image" "alpine" {
  name         = "alpine:3.23"
  keep_locally = true
}

resource "docker_container" "sleeper" {
  name        = "tfc-c1-p2-sleeper"
  image       = docker_image.alpine.image_id
  command     = ["sleep", "3600"]
  restart     = "no"
  memory      = 64
  memory_swap = 64

  labels {
    label = "tfc.challenge"
    value = "1"
  }
}
