# Challenge 1, part 1: a random name, a file and a container.
# The first plan and apply work. The second plan does not say "No changes". Find out why and fix it.

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

# A random name such as "classic-gar". It is made once and then kept in state.
resource "random_pet" "name" {
  length = 2
}

# A small text file in this folder.
resource "local_file" "greeting" {
  filename = "${path.module}/greeting.txt"
  content  = "hello from ${random_pet.name.id} at ${timestamp()}\n"
}

# The image. keep_locally = true means destroy leaves it on your machine.
resource "docker_image" "alpine" {
  name         = "alpine:3.23"
  keep_locally = true
}

# A container that does nothing but sleep.
resource "docker_container" "sleeper" {
  # TODO: every Docker object in this challenge is named tfc-c1-<what>.
  name    = "sleeper"
  image   = docker_image.alpine.image_id
  command = ["sleep", "3600"]
  memory  = 64

  # TODO: every Docker object in this challenge carries the label tfc.challenge=1.
  # Add a labels block with label = "tfc.challenge" and value = "1".
}
