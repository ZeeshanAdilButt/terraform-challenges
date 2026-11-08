# Plan tests: they run the module with the provider replaced by a mock, so no Docker engine is needed.
# command = plan checks what the module would build, without building it.
#
# TODO (part 1): add two more run blocks to this file.
#   web_is_published_on_loopback_only  gives web_port 18999 and asserts the web container publishes exactly
#                                      that port, on ip 127.0.0.1:  one(docker_container.web.ports).external
#   protected_label_follows_the_input  gives protected = true and asserts the cache container carries the label
#                                      tfc.protected=true:  contains([for l in docker_container.cache.labels : "${l.label}=${l.value}"], "...")

mock_provider "docker" {}

variables {
  name        = "tfc-c14-dev"
  environment = "dev"
  web_port    = 18401
  data_volume = "tfc-c14-dev-cache-data"
}

run "names_follow_the_prefix" {
  command = plan
  module {
    source = "./modules/service"
  }

  assert {
    condition     = docker_container.web.name == "tfc-c14-dev-web" && docker_container.cache.name == "tfc-c14-dev-cache"
    error_message = "The containers must be called <name>-web and <name>-cache."
  }
}
