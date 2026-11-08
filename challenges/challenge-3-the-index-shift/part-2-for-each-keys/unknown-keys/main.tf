# Two random pets, and one file per pet. The files are made with for_each.
# This folder is planned on its own by run.mjs. The starter fails: fix the one TODO.

terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.9"
    }
  }
}

resource "random_pet" "app" {
  count = 2
}

resource "local_file" "pet_file" {
  # TODO: these keys are the pets' own names, which Terraform only learns when it creates the pets.
  # for_each needs its KEYS at plan time. Keep the pet names as VALUES, and write the keys yourself:
  # for_each = { first = random_pet.app[0].id, second = random_pet.app[1].id }
  # and use each.value where the pet name is needed.
  for_each = toset(random_pet.app[*].id)

  filename = "${path.module}/pets/${each.key}.txt"
  content  = "pet ${each.key}\n"
}
