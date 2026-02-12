#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

zip -r lambda.zip handler.js

echo "Created lambda.zip"
