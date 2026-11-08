resource "docker_container" "this" {
  name        = var.name
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

  dynamic "labels" {
    for_each = var.extra_labels
    content {
      label = labels.key
      value = labels.value
    }
  }

  networks_advanced {
    name = var.network_name
  }
}
