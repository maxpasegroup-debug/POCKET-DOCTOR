#!/bin/sh
set -eu
umask 077
if [ "${DOCTOR_CREDENTIAL_STORAGE:-disabled}" = "railway-volume" ]; then
  node /app/dist/prepare-credential-volume.js
fi
# Root is used only for fixed volume-directory provisioning; API/worker run as node.
exec gosu node "$@"
