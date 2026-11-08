# The state of the dev environment. The host and port are replaced when you run Terraform through
# capstone/ci/pipeline.mjs or through the challenge scripts, so only the name after /state/ matters here.
# No password in this file. The token comes from the environment: TF_HTTP_USERNAME and TF_HTTP_PASSWORD.
address        = "http://127.0.0.1:8850/state/dev/platform"
lock_address   = "http://127.0.0.1:8850/lock/dev/platform"
unlock_address = "http://127.0.0.1:8850/lock/dev/platform"
lock_method    = "LOCK"
unlock_method  = "UNLOCK"
