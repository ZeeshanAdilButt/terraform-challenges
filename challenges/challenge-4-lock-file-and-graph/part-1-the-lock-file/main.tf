# The team's configuration. It uses one provider, hashicorp/local, to write a small file.
terraform {
  required_providers {
    local = {
      source = "hashicorp/local"
      # FIX 1: say which versions of the provider this configuration accepts.
    }
  }
}

resource "local_file" "greeting" {
  filename = "${path.module}/greeting.txt"
  content  = "hello from the lock file challenge\n"
}
