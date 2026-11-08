# Not for editing. The configuration as it is applied today. run.mjs applies it first.
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.9"
    }
  }
}

provider "docker" {}

resource "docker_container" "web" {
  name        = "tfc-c6-web"
  image       = "nginx:1.27-alpine"
  memory      = 64
  memory_swap = 64

  labels {
    label = "tfc.challenge"
    value = "6"
  }
}

resource "docker_container" "worker" {
  name        = "tfc-c6-worker"
  image       = "alpine:3.23"
  command     = ["sleep", "600"]
  memory      = 64
  memory_swap = 64

  labels {
    label = "tfc.challenge"
    value = "6"
  }
}

resource "local_file" "motd" {
  filename = "${path.module}/out/motd.txt"
  content  = "welcome\n"
}

resource "terraform_data" "old" {
  input = "legacy job"
}

resource "terraform_data" "same" {
  input = "unchanged"
}

resource "terraform_data" "cbd" {
  triggers_replace = "v1"

  lifecycle {
    create_before_destroy = true
  }
}
