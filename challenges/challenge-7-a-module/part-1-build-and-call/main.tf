terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

variable "environments" {
  description = "One entry per environment: the memory limit of its container."
  type        = map(object({ memory_mb = number }))
  default = {
    dev  = { memory_mb = 64 }
    prod = { memory_mb = 128 }
  }
}

resource "docker_image" "alpine" {
  name         = "alpine:3.23"
  keep_locally = true
}

resource "docker_network" "env" {
  for_each = var.environments
  name     = "tfc-c7-${each.key}-net"

  labels {
    label = "tfc.challenge"
    value = "7"
  }
}

module "app" {
  source   = "./modules/app-container"
  for_each = var.environments

  name         = "tfc-c7-${each.key}-app"
  environment  = each.key
  image        = docker_image.alpine.image_id
  network_name = docker_network.env[each.key].name
  memory_mb    = each.value.memory_mb
  env = {
    APP_ENV   = each.key
    APP_TOKEN = "fake-token-not-a-real-secret"
  }
}

output "apps" {
  description = "Everything each environment's module hands back to its caller."
  value       = module.app
}
