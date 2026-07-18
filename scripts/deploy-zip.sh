#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm test
npm run zip
npm run zip:firefox
echo "Zip artifacts under .output/"
