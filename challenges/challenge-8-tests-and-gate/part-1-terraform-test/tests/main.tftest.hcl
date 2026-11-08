# Tests for main.tf. Run them with: terraform test
# Each run block is one test. command = plan checks the plan only. command = apply really creates the file,
# checks it, and destroys it when the test file ends.

run "default_upstreams" {
  command = plan

  assert {
    condition     = output.upstream_count == 2
    error_message = "The default is 2 replicas, so the config should list 2 upstream servers."
  }
}

run "config_has_the_port" {
  command = apply

  assert {
    condition     = strcontains(local_file.nginx_conf.content, "listen 8080;")
    error_message = "The generated config should contain 'listen 8080;'."
  }
}

run "privileged_port_is_refused" {
  command = plan

  variables {
    port = 80
  }

  expect_failures = [var.port]
}

run "lowest_allowed_port_is_accepted" {
  command = plan

  variables {
    port = 1024
  }

  assert {
    condition     = strcontains(local_file.nginx_conf.content, "listen 1024;")
    error_message = "Port 1024 is the lowest allowed port and must be accepted."
  }
}

# TODO (yours): add a run block named "too_high_port_is_refused".
# It sets port = 70000 and expects var.port to fail, like "privileged_port_is_refused" does for port 80.
