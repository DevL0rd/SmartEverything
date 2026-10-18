#!/bin/sh
cd "$(dirname "$0")/.." || exit 1
node .design-sync/build-kit.mjs && node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle
