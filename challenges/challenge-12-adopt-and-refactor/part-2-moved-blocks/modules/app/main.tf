terraform {
  required_providers {
    docker = {
      source = "kreuzwerker/docker"
    }
  }
}

# Was docker_network.net
resource "docker_network" "main" {
  name = "tfc-c12-net"

  labels {
    label = "tfc.challenge"
    value = "12"
  }
}

# Was docker_container.web
resource "docker_container" "frontend" {
  name        = "tfc-c12-web"
  image       = "nginx:1.27-alpine"
  memory      = 64
  memory_swap = 64

  networks_advanced {
    name = docker_network.main.name
  }

  labels {
    label = "tfc.challenge"
    value = "12"
  }
}

# Was docker_container.cache
resource "docker_container" "backend" {
  name        = "tfc-c12-cache"
  image       = "alpine:3.23"
  command     = ["sleep", "3600"]
  memory      = 64
  memory_swap = 64

  networks_advanced {
    name = docker_network.main.name
  }

  labels {
    label = "tfc.challenge"
    value = "12"
  }
}
