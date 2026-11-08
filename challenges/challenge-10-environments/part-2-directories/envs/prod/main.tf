# The prod environment. Its own folder, its own state (the "http" backend, configured by backend.hcl).
# One fault is planted here: nothing protects prod from a destroy.

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
  name        = "tfc-c10-p2-prod-app"
  image       = docker_image.alpine.image_id
  command     = ["sleep", "3600"]
  env         = ["APP_ENV=prod", "GREETING=hello"]
  memory      = 64
  memory_swap = 64

  labels {
    label = "tfc.challenge"
    value = "10"
  }
}

output "environment" {
  value = "prod"
}
