#!/bin/bash

set -euxo pipefail

npx prisma migrate deploy
exec node server.js
