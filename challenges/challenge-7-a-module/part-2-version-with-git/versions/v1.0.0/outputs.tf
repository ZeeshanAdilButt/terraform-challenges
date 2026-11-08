output "container_name" {
  description = "Name of the container."
  value       = docker_container.this.name
}

output "network_name" {
  description = "The network the container joined."
  value       = var.network_name
}

output "ip_address" {
  description = "Address of the container on its network."
  value       = docker_container.this.network_data[0].ip_address
}
