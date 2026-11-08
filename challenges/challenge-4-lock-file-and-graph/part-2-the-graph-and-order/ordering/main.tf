# A tiny release: the database must be ready before the migrations run, and the seed data goes in last.
terraform {
  required_providers {
    time = {
      source  = "hashicorp/time"
      version = "~> 0.14"
    }
  }
}

# Stands in for a database that takes two seconds to become ready.
resource "time_sleep" "database_ready" {
  create_duration = "2s"
}

# Must run after the database is ready. Nothing in it uses a value from the database,
# so Terraform cannot see the order by itself.
resource "terraform_data" "migrate" {
  input = "run the migrations"
  # FIX 1: tell Terraform about the order. Which meta-argument does that?
}

# This one reads migrate's id, so Terraform already knows it comes after migrate.
resource "terraform_data" "seed" {
  input = "seed the data after ${terraform_data.migrate.id}"
}
