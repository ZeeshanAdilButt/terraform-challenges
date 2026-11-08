# Not for editing. This is the configuration as it was last month. run.mjs applies it first,
# so that the state holds these three resources.
terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.9"
    }
  }
}

resource "local_file" "notes" {
  filename = "${path.module}/out/notes.txt"
  content  = "team notes\n"
}

resource "local_file" "legacy" {
  filename = "${path.module}/out/legacy.txt"
  content  = "an old file that another team still reads\n"
}

resource "terraform_data" "build" {
  input = "build-1"
}
