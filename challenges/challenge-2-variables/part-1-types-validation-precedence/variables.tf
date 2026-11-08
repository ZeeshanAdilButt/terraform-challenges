# Challenge 2, part 1: five input variables. Three things are missing or wrong. The test tells you which.

variable "project" {
  type        = string
  description = "Project name. A required variable: it has no default."

  # TODO: add a validation block. The name must be 3 to 12 characters, lowercase letters and digits only.
  # Use condition = can(regex("^[a-z0-9]{3,12}$", var.project)) and write an error_message a stranger can act on.
}

variable "replicas" {
  # TODO: this is a count, so it should be a number, not a string.
  type        = string
  default     = 2
  description = "How many copies to run."

  # TODO: add a validation block. A whole number from 1 to 5.
  # Hint: var.replicas == floor(var.replicas) is false for 2.5.
}

variable "ports" {
  type        = list(number)
  default     = [80, 443]
  description = "Ports to open."
}

variable "labels" {
  type        = map(string)
  default     = { team = "platform" }
  description = "Free-form labels."
}

variable "limits" {
  type = object({
    cpu       = number
    memory_mb = number
  })
  default     = { cpu = 1, memory_mb = 256 }
  description = "Resource limits for one copy."
}

# The variable the precedence experiments set in seven different places.
variable "greeting" {
  type    = string
  default = "default"
}
