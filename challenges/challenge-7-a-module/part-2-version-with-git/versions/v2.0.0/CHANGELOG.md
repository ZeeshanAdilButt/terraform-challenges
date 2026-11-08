# Changelog

## 2.0.0
- BREAKING: the input memory_mb is now memory_limit_mb. Callers must rename the argument.

## 1.1.0
- Added the optional input extra_labels (default: none) and the output container_id. Nothing that worked in 1.0.0 changes.

## 1.0.0
- First release. Inputs: name, environment, image, network_name, memory_mb, env. Outputs: container_name, network_name, ip_address.
