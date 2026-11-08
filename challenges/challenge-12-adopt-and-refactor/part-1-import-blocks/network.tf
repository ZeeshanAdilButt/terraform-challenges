# The network is done: a docker_network is imported by its name, and its labels are read back.
resource "docker_network" "net" {
  name = "tfc-c12-net"

  labels {
    label = "tfc.challenge"
    value = "12"
  }
}
