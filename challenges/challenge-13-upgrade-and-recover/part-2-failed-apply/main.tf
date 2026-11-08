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
  name = "tfc-c13-net"

  labels {
    label = "tfc.challenge"
    value = "13"
  }
}

# Three containers. "second" is built after "first", and "third" after "second".
resource "docker_container" "first" {
  name        = "tfc-c13-first"
  image       = "nginx:1.27-alpine"
  memory      = 64
  memory_swap = 64

  ports {
    internal = 80
    external = 8841
    ip       = "127.0.0.1"
  }

  networks_advanced {
    name = docker_network.net.name
  }

  labels {
    label = "tfc.challenge"
    value = "13"
  }
}

resource "docker_container" "second" {
  name        = "tfc-c13-second"
  image       = "nginx:1.27-alpine"
  memory      = 64
  memory_swap = 64
  depends_on  = [docker_container.first]

  ports {
    internal = 80
    external = 8841
    ip       = "127.0.0.1"
  }

  networks_advanced {
    name = docker_network.net.name
  }

  labels {
    label = "tfc.challenge"
    value = "13"
  }
}

resource "docker_container" "third" {
  name        = "tfc-c13-third"
  image       = "alpine:3.23"
  command     = ["sleep", "3600"]
  memory      = 64
  memory_swap = 64
  depends_on  = [docker_container.second]

  networks_advanced {
    name = docker_network.net.name
  }

  labels {
    label = "tfc.challenge"
    value = "13"
  }
}
