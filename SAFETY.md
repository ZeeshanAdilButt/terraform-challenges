# Safety rules

These challenges run Terraform on your machine and start containers with the Docker provider. Your machine also runs your other work, and Docker is shared. These rules keep the challenges small and keep your other work safe. They are repeated, short, in every README.

## The rules

1. **No cloud account, no credentials.** Every challenge uses the `random`, `local` and `terraform_data` resources and the Docker provider. Nothing here talks to a cloud. If a challenge ever asks for a cloud key, stop: something is wrong.
2. **Everything we create has a name and a label.** Container, network and volume names look like `tfc-c5-web`. Every Docker object also carries the label `tfc.challenge=5` (the number is the challenge). The configurations add both.
3. **Cleanup uses the label and nothing else.** `node toolkit/cleanup.mjs 5` removes only Docker objects with the label `tfc.challenge=5`. It does not touch your other containers, images, networks or volumes. Run it after a challenge, and before you start it again if a run stopped halfway.
4. **Never run `docker system prune`, `docker volume prune` or `docker image prune -a` here.** They delete things you did not create. Other projects on your machine may need those images and volumes.
5. **Images stay on your machine.** Every `docker_image` resource sets `keep_locally = true`. Without it, `terraform destroy` removes the image from your machine, even when another project uses it. Challenge 1 shows this on purpose with a throwaway image tag.
6. **One named exception for the Docker socket.** When the toolkit runs Terraform inside the official container (docker mode), parts that use the Docker provider mount `/var/run/docker.sock` so the provider can reach your Docker. Anything with that socket can control your Docker, so only the pinned official `hashicorp/terraform` and `ghcr.io/opentofu/opentofu` images get it, and only in those parts. If you run your own `terraform` binary (local mode), no mount is needed.
7. **Every state and plan stays in your folder.** State files can hold secrets. The `.gitignore` keeps `*.tfstate*`, `.terraform/` and `*.tfplan` out of Git. Never remove those lines.
8. **Experiments are small.** Containers use tiny images (`alpine:3.23`, `nginx:1.27-alpine`) with memory and process limits set in the configuration.
9. **Never kill processes by name.** If a run hangs, press Ctrl+C in its terminal. The toolkit stops the helper servers it starts.
