# Challenge 0: your first Terraform configuration.
# Two small fixes are needed. The test tells you which.

terraform {
  required_providers {
    random = {
      source = "hashicorp/random"
      # TODO: pin the provider to the 3.9 line.
    }
  }
}

# A random_pet makes a random name such as "classic-gar". It creates nothing outside Terraform's own state.
resource "random_pet" "toolkit" {
  # TODO: a name of three words.
  length = 1
}

output "pet" {
  value = random_pet.toolkit.id
}
