# The code today. Somebody decided that the cache container is not Terraform's business any more (another team
# will run it) and deleted its block. The container is still running, and it must keep running.
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
