# Challenge 1, part 3: destroy, and what is left.
# run.mjs first makes three throwaway image names (see README). This file manages them.
# One of the three is set up wrongly for a real project. Fix it, run again.

terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

# A second name for alpine:3.23 (made with "docker tag"). Same image, so nothing is lost when this name goes.
# keep_locally = false is on purpose here: this part shows what it does.
resource "docker_image" "throwaway" {
  name         = "tfc-c1-throwaway:1"
  keep_locally = false
}

# Another second name for alpine:3.23. In a real project an image must survive a destroy.
resource "docker_image" "kept" {
  name = "tfc-c1-kept:1"
  # TODO: say that destroy must leave this image on the machine.
}

# A small image of its own (alpine:3.23 plus one layer), with only this one name.
# keep_locally = false is on purpose here too.
resource "docker_image" "solo" {
  name         = "tfc-c1-solo:1"
  keep_locally = false
}
