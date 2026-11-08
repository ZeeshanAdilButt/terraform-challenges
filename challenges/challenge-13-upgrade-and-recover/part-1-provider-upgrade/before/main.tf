resource "random_pet" "name" {
  length = 2
}

resource "random_string" "suffix" {
  length  = 8
  special = false
  number  = false
}

resource "random_password" "db" {
  length  = 16
  special = false
  number  = true
}

resource "local_file" "greeting" {
  filename = "${path.module}/greeting.txt"
  content  = "hello ${random_pet.name.id}-${random_string.suffix.result}\n"
}
