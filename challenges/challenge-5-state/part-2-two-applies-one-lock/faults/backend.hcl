# Settings for the http backend. run.mjs fills in the host, the port and the state name before it uses this file (the words between @ signs).
address = "http://@HOST@:@PORT@/state/@NAME@"

# FIX: the state is kept, but nothing is locked. Terraform needs two more addresses:
# one to take the lock (lock_address) and one to release it (unlock_address).
# Use the same address for both, with /lock/ in place of /state/.
