#!/bin/bash
set -eu

npm install
npm run build
npx electron-builder --win
