# Not for editing. Two resources that each wait for the other: no valid order exists.
resource "terraform_data" "a" {
  input = terraform_data.b.id
}

resource "terraform_data" "b" {
  input = terraform_data.a.id
}
