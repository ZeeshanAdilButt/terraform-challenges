# The code as it was when the stack was applied: three resources.
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

resource "docker_network" "net" {
  name = "tfc-c12-net"

  labels {
    label = "tfc.challenge"
    value = "12"
  }
}

resource "docker_container" "web" {
  name        = "tfc-c12-web"
  image       = "nginx:1.27-alpine"
  memory      = 64
  memory_swap = 64

  networks_advanced {
    name = docker_network.net.name
  }

  labels {
    label = "tfc.challenge"
    value = "12"
  }
}

resource "docker_container" "cache" {
  name        = "tfc-c12-cache"
  image       = "alpine:3.23"
  command     = ["sleep", "3600"]
  memory      = 64
  memory_swap = 64

  networks_advanced {
    name = docker_network.net.name
  }

  labels {
    label = "tfc.challenge"
    value = "12"
  }
}
