# A map of objects. Each key (web, api, docs) is the address of one file; each value carries its settings.
# This file needs no edit.

variable "sites" {
  type = map(object({
    port     = number
    greeting = string
  }))
  default = {
    web  = { port = 80, greeting = "hello web" }
    api  = { port = 8080, greeting = "hello api" }
    docs = { port = 8081, greeting = "hello docs" }
  }
}

resource "local_file" "site" {
  for_each = var.sites

  filename = "${path.module}/sites/${each.key}.conf"
  content  = "listen ${each.value.port}\n# ${each.value.greeting}\n"
}
