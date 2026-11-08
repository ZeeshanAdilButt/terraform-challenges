# The configuration only reads the variables and prints them as outputs. Nothing is created.
# You edit variables.tf, not this file.

terraform {
  required_version = ">= 1.17"
}

output "summary" {
  value = "${var.project}: ${var.replicas} replicas, ports ${join(",", var.ports)}, ${var.limits.cpu} cpu, ${var.limits.memory_mb} MB"
}

output "labels" {
  value = var.labels
}

output "greeting" {
  value = var.greeting
}
