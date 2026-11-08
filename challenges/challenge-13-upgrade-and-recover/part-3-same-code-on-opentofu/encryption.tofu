# TODO: encrypt the state with OpenTofu's built-in state encryption.
#
# This file ends in .tofu on purpose: OpenTofu reads it, Terraform ignores it, so the same folder still works
# with both tools.
#
# You need three things inside terraform { encryption { ... } }:
#   1. a key_provider "pbkdf2" "NAME" { passphrase = var.state_passphrase }   (turns a passphrase into a key)
#   2. a method "aes_gcm" "NAME" { keys = key_provider.pbkdf2.NAME }            (how to encrypt)
#   3. a state { method = method.aes_gcm.NAME }                                (what to encrypt)
#
# And a variable "state_passphrase" (type string, sensitive) at the top level. run.mjs and the test pass it as the
# environment variable TF_VAR_state_passphrase. Never write the passphrase into a file.
