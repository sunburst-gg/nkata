#!/usr/bin/env bash
# Creates the R2 bucket for the server (docs/deploy.md). Safe to run again.
# Reads CLOUDFLARE_API_TOKEN (Workers R2 Storage: Edit) and CLOUDFLARE_ACCOUNT_ID from the
# environment, never from a file in the repo. R2_BUCKET defaults to nkata.
# API: https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/create/
set -euo pipefail
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN in the environment}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID in the environment}"
BUCKET="${R2_BUCKET:-nkata}"
API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets"
auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")

if curl -fsS "${auth[@]}" "$API/$BUCKET" >/dev/null 2>&1; then
  echo "bucket $BUCKET exists"
else
  out="$(curl -sS "${auth[@]}" -X POST "$API" --data "{\"name\":\"$BUCKET\",\"locationHint\":\"apac\"}")"
  if echo "$out" | grep -q '"success": *true'; then
    echo "bucket $BUCKET created"
  else
    echo "could not create $BUCKET:" >&2
    echo "$out" >&2
    exit 1
  fi
fi
echo "S3_ENDPOINT=https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
echo "S3_REGION=auto"
echo "S3_BUCKET=$BUCKET"
echo "The S3 keys come from an R2 API token (Cloudflare dashboard, R2, Manage API tokens):"
echo "its Access Key ID is S3_ACCESS_KEY and its Secret Access Key is S3_SECRET_KEY."
