#!/bin/bash
set -eu

npm install -g npm@8
npm install
npm run build
npx electron-builder --win
