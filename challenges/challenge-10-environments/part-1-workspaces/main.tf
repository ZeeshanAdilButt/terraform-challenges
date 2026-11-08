# One configuration, two environments (dev and prod), told apart by Terraform workspaces.
# Two faults are planted here. The README says what to look for.

terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

variable "greeting" {
  type    = string
  default = "hello"
}

resource "docker_image" "alpine" {
  name         = "alpine:3.23"
  keep_locally = true
}

resource "docker_container" "app" {
  name        = "tfc-c10-p1-app"
  image       = docker_image.alpine.image_id
  command     = ["sleep", "3600"]
  env         = ["GREETING=${var.greeting}"]
  memory      = 64
  memory_swap = 64

  labels {
    label = "tfc.challenge"
    value = "10"
  }
}

output "environment" {
  value = terraform.workspace
}
