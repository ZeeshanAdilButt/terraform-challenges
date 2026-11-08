# These two blocks describe the containers the way a person would write them after reading the docker command.
# They look right. They are not safe to import: read the plan before you apply anything.

resource "docker_container" "web" {
  name        = "tfc-c12-web"
  image       = "nginx:1.27-alpine"
  memory      = 64
  memory_swap = 64

  networks_advanced {
    name = "tfc-c12-net"
  }

  labels {
    label = "tfc.challenge"
    value = "12"
  }
}

resource "docker_container" "cache" {
  name        = "tfc-c12-cache"
  image       = "alpine:3.23"
  command     = ["sleep", "3600"]
  memory      = 64
  memory_swap = 64

  networks_advanced {
    name = "tfc-c12-net"
  }

  labels {
    label = "tfc.challenge"
    value = "12"
  }
}
