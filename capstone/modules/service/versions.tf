# TODO (part 1): pin the provider with a version range, "~> 4.6", the same range as in capstone/versions.tf.
# Without a range, a new major release of the provider can change what your plan does overnight.

terraform {
  required_version = ">= 1.17"

  required_providers {
    docker = {
      source = "kreuzwerker/docker"
    }
  }
}
