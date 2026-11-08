# The interface of the module: everything the caller can set. Nothing else goes in.
#
# TODO (part 1): add a validation block to each variable below, with an error_message that says what is allowed.
#   name         must match ^tfc-c14-[a-z0-9-]{1,30}$ (use can(regex(...))), so cleanup can never touch anything else
#   environment  must be "dev" or "prod" (use contains)
#   web_port     must be between 1024 and 65535
#   memory_mb    must be between 16 and 256
#   web_image    must name a tag, and the tag must not be latest (can(regex(":[^:/]+$", ...)) and !endswith(..., ":latest"))
#   cache_image  the same rule as web_image
# data_volume and protected need no validation: a string and a bool are already the right types.

variable "name" {
  description = "Prefix of every object this module makes, for example tfc-c14-dev. It must start with tfc-c14- so that cleanup can never touch anything else."
  type        = string
}

variable "environment" {
  description = "Which environment this copy of the platform belongs to: dev or prod."
  type        = string
}

variable "web_port" {
  description = "The port of this machine (127.0.0.1 only) that the web container is published on."
  type        = number
}

variable "memory_mb" {
  description = "Memory limit of the web container, in MB. The cache container always gets 64 MB."
  type        = number
  default     = 64
}

variable "web_image" {
  description = "Image of the web container. It must name a tag, and the tag must not be latest."
  type        = string
  default     = "nginx:1.27-alpine"
}

variable "cache_image" {
  description = "Image of the cache container. It must name a tag, and the tag must not be latest."
  type        = string
  default     = "valkey/valkey:8-alpine"
}

variable "data_volume" {
  description = "Name of an existing Docker volume for the cache data. The caller creates it, so the caller (not this module) decides whether it may ever be destroyed."
  type        = string
}

variable "protected" {
  description = "true marks the cache container with the label tfc.protected = true. The plan gate blocks any plan that destroys or replaces a protected resource."
  type        = bool
  default     = false
}
