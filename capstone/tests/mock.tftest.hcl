# Mock tests: command = apply against a mocked provider. Terraform really runs the whole apply, in memory:
# the outputs are computed and the dependencies are followed, and nothing touches Docker.
# What a mock cannot tell you: that the port is free, that the image exists, that the containers can talk.
# Part 1 checks those against the real Docker engine.
#
# TODO (part 1): write these run blocks (command = apply, module { source = "./modules/service" }):
#   outputs_describe_the_platform        output.web_url == "http://127.0.0.1:18402" and
#                                        output.cache_address == "tfc-c14-prod-cache:6379"
#   web_is_told_where_the_cache_is       contains(docker_container.web.env, "CACHE_HOST=tfc-c14-prod-cache")
#   the_cache_keeps_its_data_on_the_volume   one(docker_container.cache.volumes).volume_name == the data volume,
#                                        and container_path == "/data"

mock_provider "docker" {}

variables {
  name        = "tfc-c14-prod"
  environment = "prod"
  web_port    = 18402
  data_volume = "tfc-c14-prod-cache-data"
}
