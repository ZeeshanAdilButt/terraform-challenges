terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.9"
    }
  }
}

variable "app_name" {
  description = "Name of the app. Used in the file name and in every upstream line."
  type        = string
  default     = "shop"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.app_name))
    error_message = "app_name must be 3 to 21 characters: lower-case letters, digits and dashes, starting with a letter."
  }
}

variable "port" {
  description = "Port the app listens on. Ports below 1024 need extra privileges, so they are not allowed."
  type        = number
  default     = 8080

  validation {
    condition     = var.port > 1024
    error_message = "port must be between 1024 and 65535."
  }
}

variable "replicas" {
  description = "How many upstream servers to list."
  type        = number
  default     = 2
}

locals {
  upstreams = [for i in range(1, var.replicas) : "${var.app_name}-${i}:${var.port}"]
}

resource "local_file" "nginx_conf" {
  filename = "${path.module}/out/${var.app_name}.conf"
  content = join("\n", concat(
    ["upstream ${var.app_name} {"],
    [for u in local.upstreams : "  server ${u};"],
    ["}", "server {", "  listen ${var.port};", "}", ""],
  ))
}

output "upstream_count" {
  description = "Number of upstream servers in the config."
  value       = length(local.upstreams)
}

output "config_path" {
  description = "Where the config file is written."
  value       = local_file.nginx_conf.filename
}
