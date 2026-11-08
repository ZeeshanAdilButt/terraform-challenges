# One web container and one cache container on a network of their own.
# Everything carries the label tfc.challenge = 14 so that `node toolkit/cleanup.mjs 14` can find it.

resource "docker_image" "web" {
  name         = var.web_image
  keep_locally = true
}

resource "docker_image" "cache" {
  name         = var.cache_image
  keep_locally = true
}

resource "docker_network" "this" {
  name = "${var.name}-net"

  labels {
    label = "tfc.challenge"
    value = "14"
  }
  labels {
    label = "tfc.environment"
    value = var.environment
  }
}

# TODO (part 1): the cache container, resource "docker_container" "cache".
#   name         "${var.name}-cache"
#   image        docker_image.cache.image_id
#   command      ["valkey-server", "--appendonly", "yes", "--appendfsync", "always"]   (writes reach the volume at once)
#   memory       64, and memory_swap 64
#   volumes      one block: volume_name = var.data_volume, container_path = "/data"
#   networks_advanced   one block: name = docker_network.this.name
#   labels       tfc.challenge = 14, tfc.environment = var.environment, tfc.role = cache,
#                tfc.protected = "true" or "false" (from var.protected)
#
# TODO (part 1): the web container, resource "docker_container" "web".
#   name         "${var.name}-web"
#   image        docker_image.web.image_id
#   memory       var.memory_mb, and memory_swap the same
#   env          ["CACHE_HOST=<the name of the cache container>", "CACHE_PORT=6379"]  (using the cache container's name
#                attribute makes Terraform build the cache first)
#   ports        one block: internal 80, external var.web_port, ip "127.0.0.1" (this machine only)
#   networks_advanced   one block: name = docker_network.this.name
#   labels       tfc.challenge = 14, tfc.environment = var.environment, tfc.role = web
