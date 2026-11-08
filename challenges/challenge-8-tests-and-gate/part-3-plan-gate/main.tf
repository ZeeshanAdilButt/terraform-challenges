terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

variable "with_db" {
  description = "Set to false to remove the database container."
  type        = bool
  default     = true
}

variable "db_name" {
  description = "Name of the database container. Changing it replaces the container."
  type        = string
  default     = "tfc-c8-db"
}

variable "web_name" {
  description = "Name of the web container. Changing it replaces the container."
  type        = string
  default     = "tfc-c8-web"
}

variable "web_memory_mb" {
  description = "Memory limit of the web container in MB."
  type        = number
  default     = 64
}

variable "db_memory_mb" {
  description = "Memory limit of the database container in MB."
  type        = number
  default     = 64
}

# A check block reports a problem as a warning and lets the plan continue.
check "web_memory_is_modest" {
  assert {
    condition     = var.web_memory_mb <= 128
    error_message = "web_memory_mb is above 128. This stack is meant to stay small."
  }
}

resource "docker_image" "alpine" {
  name         = "alpine:3.23"
  keep_locally = true
}

resource "docker_network" "app" {
  name = "tfc-c8-gate-net"

  labels {
    label = "tfc.challenge"
    value = "8"
  }
}

# The database is tagged protected: the plan gate refuses any plan that removes or replaces it.
resource "docker_container" "db" {
  count       = var.with_db ? 1 : 0
  name        = var.db_name
  image       = docker_image.alpine.image_id
  command     = ["sleep", "3600"]
  memory      = var.db_memory_mb
  memory_swap = var.db_memory_mb

  labels {
    label = "tfc.challenge"
    value = "8"
  }
  labels {
    label = "tfc.protected"
    value = "true"
  }

  networks_advanced {
    name = docker_network.app.name
  }

  # A precondition stops the plan itself when its condition is false.
  lifecycle {
    precondition {
      condition     = var.db_memory_mb >= 32
      error_message = "db_memory_mb must be at least 32: the database needs room to start."
    }
  }
}

resource "docker_container" "web" {
  name        = var.web_name
  image       = docker_image.alpine.image_id
  command     = ["sleep", "3600"]
  memory      = var.web_memory_mb
  memory_swap = var.web_memory_mb

  labels {
    label = "tfc.challenge"
    value = "8"
  }

  networks_advanced {
    name = docker_network.app.name
  }
}
