# Challenge 3, part 1: five files, one per name, made with count.
# Fix the count, then predict what happens when the list changes. Your predictions go in predictions.json.

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
  # TODO: the number of files must follow the list, not a fixed 5.
  # run.mjs will shorten and change the list. A fixed 5 breaks as soon as the list has four names.
  count = 5

  filename = "${path.module}/out/item-${count.index}.txt"
  content  = "hello ${var.names[count.index]}\n"
}
