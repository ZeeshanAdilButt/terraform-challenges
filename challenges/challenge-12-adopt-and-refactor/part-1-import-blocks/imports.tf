# One import block per object that already exists. `to` is the address in your configuration, `id` is how the
# provider names the real object. The network is imported by its name. The containers are not: see step 3.

import {
  to = docker_network.net
  id = "tfc-c12-net"
}

# TODO: import docker_container.web (its id is var.web_id)
# TODO: import docker_container.cache (its id is var.cache_id)
