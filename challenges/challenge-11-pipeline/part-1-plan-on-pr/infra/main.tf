terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

variable "db_mode" {
  type    = string
  default = "standard"
}

resource "docker_image" "alpine" {
  name         = "alpine:3.23"
  keep_locally = true
}

resource "docker_volume" "data" {
  name = "tfc-c11-p1-data"

  labels {
    label = "tfc.challenge"
    value = "11"
  }
}

resource "docker_container" "db" {
  name        = "tfc-c11-p1-db"
  image       = docker_image.alpine.image_id
  command     = ["sleep", "3600"]
  env         = ["DB_MODE=${var.db_mode}"]
  memory      = 64
  memory_swap = 64

  volumes {
    volume_name    = docker_volume.data.name
    container_path = "/data"
  }

  labels {
    label = "tfc.challenge"
    value = "11"
  }
}
