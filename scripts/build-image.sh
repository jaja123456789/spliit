#!/bin/bash

SPLIIT_APP_NAME=$(sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' package.json)
SPLIIT_VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json)

# we need to set dummy data for POSTGRES env vars in order for build not to fail
docker buildx build \
    -t ${SPLIIT_APP_NAME}:${SPLIIT_VERSION} \
    -t ${SPLIIT_APP_NAME}:latest \
    .

#docker image prune -f
