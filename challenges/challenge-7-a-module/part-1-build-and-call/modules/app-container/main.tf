# The module you are asked to fix. It works for one copy and breaks for two.
# Run run.mjs, read what it says, and fix one thing at a time.

provider "docker" {
  host = "unix:///var/run/docker.sock"
}

resource "docker_container" "this" {
  name        = "tfc-c7-app"
  image       = var.image
  command     = ["sleep", "3600"]
  memory      = var.memory_mb
  memory_swap = var.memory_mb
  env         = [for k, v in var.env : "${k}=${v}"]

  labels {
    label = "tfc.challenge"
    value = "7"
  }
  labels {
    label = "tfc.environment"
    value = var.environment
  }

  networks_advanced {
    name = var.network_name
  }
}
