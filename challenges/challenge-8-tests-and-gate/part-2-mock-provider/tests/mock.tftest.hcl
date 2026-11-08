# Tests that never talk to Docker. mock_provider "docker" replaces the provider: every resource is made up
# in memory, so these tests run with no Docker engine, in a second, with nothing to clean up.

mock_provider "docker" {}

run "ip_is_an_address" {
  command = apply

  assert {
    condition     = can(cidrhost("${output.ip_address}/32", 0))
    error_message = "ip_address must be an IPv4 address, got '${output.ip_address}'."
  }
}

run "container_joins_the_app_network" {
  command = apply

  assert {
    condition     = one(docker_container.web.networks_advanced).name == "tfc-c8-app-net"
    error_message = "The container must join the app network."
  }
}

run "memory_limit_is_set" {
  command = apply

  variables {
    memory_mb = 128
  }

  assert {
    condition     = docker_container.web.memory == 128
    error_message = "memory_mb = 128 must become a 128 MB limit."
  }
}

# TODO (yours): add a run block named "url_has_the_port".
# It sets port = 9090 and asserts that output.url is "http://10.0.0.5:9090".
# The address 10.0.0.5 is not real. It is the value your mock invents (see the first run).
