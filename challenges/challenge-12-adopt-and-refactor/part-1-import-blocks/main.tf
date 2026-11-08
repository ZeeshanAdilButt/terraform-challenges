terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

# The ids of the two hand-built containers. run.mjs and test.mjs build the stack with the docker command and
# write the ids into hand-built.auto.tfvars.json. In real life you would paste the id into the import block.
variable "web_id" {
  type = string
}

variable "cache_id" {
  type = string
}
