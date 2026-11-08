terraform {
  # The state lives on the teaching state server. run.mjs writes backend.hcl with its address.
  backend "http" {}

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.14"
    }
  }
}

provider "docker" {}

variable "message" {
  type    = string
  default = "base"
}

# A real deployment takes time. This resource takes hold_seconds, so an apply keeps the state lock for a while.
variable "hold_seconds" {
  type    = number
  default = 30
}

resource "docker_image" "alpine" {
  name         = "alpine:3.23"
  keep_locally = true
}

resource "time_sleep" "deploy" {
  create_duration = "${var.hold_seconds}s"

  triggers = {
    message = var.message
  }
}

resource "docker_container" "app" {
  name        = "tfc-c11-p3-app"
  image       = docker_image.alpine.image_id
  command     = ["sleep", "3600"]
  env         = ["MESSAGE=${var.message}"]
  memory      = 64
  memory_swap = 64

  labels {
    label = "tfc.challenge"
    value = "11"
  }

  depends_on = [time_sleep.deploy]
}
