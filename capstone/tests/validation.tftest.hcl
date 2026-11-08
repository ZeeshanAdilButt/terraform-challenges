# Failing-validation tests: each run gives the module one bad input and says which variable must refuse it.
# expect_failures turns the refusal into a pass. If the validation rule were missing, the run would fail.
#
# TODO (part 1): add one run block for each of these, in the same shape as the first one:
#   unknown_environment_is_refused   environment = "staging"            expect_failures = [var.environment]
#   privileged_port_is_refused       web_port = 80                      expect_failures = [var.web_port]
#   memory_out_of_range_is_refused   memory_mb = 4096                   expect_failures = [var.memory_mb]
#   latest_tag_is_refused            cache_image = "valkey/valkey:latest"   expect_failures = [var.cache_image]

mock_provider "docker" {}

variables {
  name        = "tfc-c14-dev"
  environment = "dev"
  web_port    = 18401
  data_volume = "tfc-c14-dev-cache-data"
}

run "name_without_the_prefix_is_refused" {
  command = plan
  module {
    source = "./modules/service"
  }

  variables {
    name = "web"
  }

  expect_failures = [var.name]
}
