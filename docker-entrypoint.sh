#!/bin/sh
# Migrations run in-process before the server starts. replicaCount is 1, so there is no
# race worth guarding; a failed migration must stop the pod rather than serve a schema
# the code does not expect.
set -e

cd /app/migrate
node migrate.mjs

cd /app
exec node server.js
