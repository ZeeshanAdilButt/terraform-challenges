output "container_name" {
  value = docker_container.this.name
}

output "network_name" {
  value = var.network_name
}

output "ip_address" {
  value = docker_container.this.network_data[0].ip_address
}

output "container" {
  value = docker_container.this
}
