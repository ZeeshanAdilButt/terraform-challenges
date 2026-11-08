# Challenge 3, part 2: the same five files, made with for_each.
# The starter fails: for_each does not accept a list. Fix it. sites.tf and unknown-keys/ need no edit,
# except the one TODO in unknown-keys/main.tf.

terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.9"
    }
  }
}

variable "names" {
  type    = list(string)
  default = ["alpha", "bravo", "charlie", "delta", "echo"]
}

resource "local_file" "item" {
  # TODO: for_each wants a map, or a set of strings. A list is neither. Turn it into a set.
  for_each = var.names

  # With a set, each.key and each.value are the same: the name itself. The name is the address.
  filename = "${path.module}/out/${each.key}.txt"
  content  = "hello ${each.value}\n"
}
