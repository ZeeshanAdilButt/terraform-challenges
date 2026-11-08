variable "name" {
  description = "Container name."
  type        = string
}

variable "environment" {
  description = "Which environment this copy belongs to."
  type        = string
}

variable "image" {
  description = "Image id of the container (the caller pulls it)."
  type        = string
}

variable "network_name" {
  description = "Name of an existing Docker network to join."
  type        = string
}

variable "memory_mb" {
  description = "Memory limit in MB."
  type        = number
  default     = 64
}

variable "env" {
  description = "Environment variables for the container, as a map."
  type        = map(string)
  default     = {}
}
