#!/bin/sh
# Migrations run in-process before the server starts. replicaCount is 1, so there is no
# race worth guarding; a failed migration must stop the pod rather than serve a schema
# the code does not expect.
set -e

cd /app/migrate
node migrate.mjs

# The roster is the allowlist: with no rows in `players`, a correct Steam login is
# still refused and nobody can get in. Seeding it here keeps the roster declarative in
# Terraform rather than something someone has to remember to run by hand. Idempotent,
# and it deliberately leaves `active` alone so deactivating someone is not undone by
# the next deploy.
if [ -n "${ROSTER:-}" ]; then
  node seed-roster.mjs
fi

cd /app
exec node server.js
