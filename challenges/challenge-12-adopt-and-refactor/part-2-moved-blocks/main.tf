# The code after the refactor: the three resources now live in a module, with better names.
# The stack is already running under the OLD addresses (see before/main.tf). Your job: tell Terraform that
# the new addresses are the same objects. Do it in moves.tf.
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}

module "app" {
  source = "./modules/app"
}
