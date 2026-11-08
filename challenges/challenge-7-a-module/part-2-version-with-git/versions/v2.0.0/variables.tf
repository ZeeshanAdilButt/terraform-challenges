variable "name" {
  description = "Container name."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.name))
    error_message = "name must be 3 to 41 characters: lower-case letters, digits and dashes, starting with a letter."
  }
}

variable "environment" {
  description = "Which environment this copy belongs to."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "image" {
  description = "Image id of the container (the caller pulls it)."
  type        = string
}

variable "network_name" {
  description = "Name of an existing Docker network to join."
  type        = string
}

variable "memory_limit_mb" {
  description = "Memory limit in MB."
  type        = number
  default     = 64

  validation {
    condition     = var.memory_limit_mb >= 16 && var.memory_limit_mb <= 256
    error_message = "memory_limit_mb must be between 16 and 256."
  }
}

variable "env" {
  description = "Environment variables for the container, as a map."
  type        = map(string)
  default     = {}
}

variable "extra_labels" {
  description = "Extra labels for the container, as a map. Added in 1.1.0."
  type        = map(string)
  default     = {}
}
