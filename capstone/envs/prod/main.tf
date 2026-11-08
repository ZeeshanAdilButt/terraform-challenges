# The prod environment: its own folder, its own state (see backend.hcl), the same module as every other environment.

terraform {
  required_version = ">= 1.17"

  # Partial configuration: the settings that differ per machine (the host and port of the state server) are
  # filled in at init time. The name of this environment's state is in backend.hcl.
  backend "http" {}

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

variable "web_image" {
  description = "Image of the web container."
  type        = string
  default     = "nginx:1.27-alpine"
}

variable "cache_image" {
  description = "Image of the cache container. Changing it replaces the cache container."
  type        = string
  default     = "valkey/valkey:8-alpine"
}

variable "memory_mb" {
  description = "Memory limit of the web container, in MB."
  type        = number
  default     = 128
}

# The data lives here. It belongs to this environment, not to the module, so this environment decides how it is guarded.
resource "docker_volume" "cache_data" {
  name = "tfc-c14-prod-cache-data"

  labels {
    label = "tfc.challenge"
    value = "14"
  }
  labels {
    label = "tfc.environment"
    value = "prod"
  }
  labels {
    label = "tfc.protected"
    value = "true"
  }

  # TODO (part 1): prod holds real data. Add a lifecycle block with prevent_destroy = true, so that Terraform
  # refuses any plan that destroys this volume. (dev has no such block: dev is meant to be thrown away.)
}

# TODO (part 1): call the module from ../../modules/service, and hand back two outputs.
#   module "service": name = "tfc-c14-prod", environment = "prod", web_port = 18402, memory_mb = var.memory_mb,
#   web_image = var.web_image, cache_image = var.cache_image, data_volume = docker_volume.cache_data.name,
#   protected = true
#   outputs web_url and cache_address, each taken from the module (module.service.web_url ...), with a description.
