#!/bin/bash
set -eu

npm install --platform=win32
npm run build
npx electron-builder --win
