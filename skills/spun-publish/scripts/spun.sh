#!/bin/bash
# Sends one signed request to the SPUN API.
# Usage: spun.sh METHOD PATH [curl options...]
# SPUN_KEY is the user's API key. SPUN_SITE is the site, by default
# https://spun.nextbestnetwork.com.

set -eu

if [ $# -lt 2 ]; then
  echo "usage: spun.sh METHOD PATH [curl options...]" >&2
  exit 2
fi

SITE=${SPUN_SITE:-https://spun.nextbestnetwork.com}
SITE=${SITE%/}
KEY=${SPUN_KEY:-}

case $KEY in
  nbnspun-*-*) ;;
  *)
    echo "spun.sh: set SPUN_KEY to the API key, nbnspun-<key id>-<secret>" >&2
    exit 2
    ;;
esac

REST=${KEY#nbnspun-}
KEY_ID=${REST%%-*}
SECRET=${REST#*-}

METHOD=$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')
REQUEST_PATH=$2
shift 2

# curl sends no Content-Length on a POST or PUT without a body, and the API
# refuses such a request with 411.
if [ "$METHOD" = POST ] || [ "$METHOD" = PUT ]; then
  BODY=no
  for ARG in "$@"; do
    case $ARG in
      -d* | --data* | -F* | --form* | -T* | --upload-file | --json) BODY=yes ;;
    esac
  done
  if [ $BODY = no ]; then
    set -- "$@" -d ''
  fi
fi

TIMESTAMP=$(date +%s)
NONCE=$(openssl rand -hex 16)
SIGNATURE=$(printf '%s\n%s\n%s\n%s' "$METHOD" "$REQUEST_PATH" "$TIMESTAMP" "$NONCE" |
  openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

exec curl -sS -X "$METHOD" \
  -H "X-SPUN-Key: $KEY_ID" \
  -H "X-SPUN-Timestamp: $TIMESTAMP" \
  -H "X-SPUN-Nonce: $NONCE" \
  -H "X-SPUN-Signature: $SIGNATURE" \
  "$@" "$SITE$REQUEST_PATH"
