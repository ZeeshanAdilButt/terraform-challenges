# TODO: one moved block per resource. `from` is the old address, `to` is the new one:
#
# moved {
#   from = docker_network.net
#   to   = module.app.docker_network.main
# }
#
# The other two: docker_container.web and docker_container.cache. Look at the comments in modules/app/main.tf
# for the new names.
