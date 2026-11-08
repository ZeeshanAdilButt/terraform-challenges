terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

variable "port" {
  type    = number
  default = 8080
}

variable "memory_mb" {
  type    = number
  default = 64
}

resource "docker_image" "alpine" {
  name         = "alpine:3.23"
  keep_locally = true
}

resource "docker_network" "app" {
  name = "tfc-c8-app-net"
  labels {
    label = "tfc.challenge"
    value = "8"
  }
}

resource "docker_container" "web" {
  name        = "tfc-c8-web"
  image       = docker_image.alpine.image_id
  command     = ["sleep", "3600"]
  memory      = var.memory_mb
  memory_swap = var.memory_mb
  env         = ["PORT=${var.port}"]

  labels {
    label = "tfc.challenge"
    value = "8"
  }

  networks_advanced {
    name = docker_network.app.name
  }
}

output "ip_address" {
  value = docker_container.web.network_data[0].ip_address
}

output "url" {
  value = "http://${docker_container.web.network_data[0].ip_address}:${var.port}"
}
