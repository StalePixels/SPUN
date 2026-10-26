#!/bin/bash
# Builds the test binaries of .spun:
#   dot/BUILD-test/spun, dot/BUILD-test-posix/spun: SPUN_TEST_SERVER and SPUN_TEST_PORT
#     from .env are the default server.
#   dot/BUILD-test-s/spun: the Makefile's default server, for the test of -s and -p.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
set -a
. "$here/.env"
set +a

cd "$here/../dot"
test="SERVER=$SPUN_TEST_SERVER PORT=$SPUN_TEST_PORT"
make $test BUILD_DIR=./BUILD-test binaries
rm -rf BUILD-test-posix
make $test POSIX_DIR=./BUILD-test-posix posix
make BUILD_DIR=./BUILD-test-s binaries
