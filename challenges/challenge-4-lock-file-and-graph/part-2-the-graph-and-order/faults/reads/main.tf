# One resource writes a settings file. A data source reads the same file back.
terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.9"
    }
  }
}

resource "local_file" "settings" {
  filename = "${path.module}/out/settings.txt"
  content  = "region=eu\n"
}

# Reads the file that local_file.settings writes. Nothing here mentions that resource,
# so Terraform tries to read the file while it plans, before the file exists.
data "local_file" "settings" {
  filename = "${path.module}/out/settings.txt"
  # FIX 2: make the read wait for the file to be written.
}

output "settings" {
  value = data.local_file.settings.content
}
