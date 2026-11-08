# The dev environment. Its own folder, its own state (the "http" backend). The address comes from run.mjs.
# The password never goes in a file: it arrives in the environment variable TF_HTTP_PASSWORD.

terraform {
  backend "http" {}

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

resource "docker_image" "alpine" {
  name         = "alpine:3.23"
  keep_locally = true
}

resource "docker_container" "app" {
  name        = "tfc-c10-p3-dev-app"
  image       = docker_image.alpine.image_id
  command     = ["sleep", "3600"]
  env         = ["APP_ENV=dev", "GREETING=hello"]
  memory      = 64
  memory_swap = 64

  labels {
    label = "tfc.challenge"
    value = "10"
  }
}

output "environment" {
  value = "dev"
}
