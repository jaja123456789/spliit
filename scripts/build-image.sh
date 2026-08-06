#!/bin/bash

SPLIIT_APP_NAME=$(sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' package.json)
SPLIIT_VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json)
# Marks the image with the commit it was built from; "unknown" outside a git checkout.
SPLIIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)

# we need to set dummy data for POSTGRES env vars in order for build not to fail
docker build \
  --build-arg "APP_VERSION=${SPLIIT_VERSION}" \
  --build-arg "APP_COMMIT=${SPLIIT_COMMIT}" \
  -t "${SPLIIT_APP_NAME}:${SPLIIT_VERSION}" \
  -t "${SPLIIT_APP_NAME}:latest" \
  .

#docker image prune -f
