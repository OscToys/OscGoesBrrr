#!/bin/bash
set -eu

TMP=$(wslpath -a "$(cmd.exe /c echo %temp% 2>/dev/null)" | sed 's/\r$//')
mkdir -p "$TMP/ogb"
DIR="$PWD"
cd "$TMP/ogb"
npm install electron@23.2.0 --platform=win32
cmd.exe /c 'node_modules\electron\dist\electron.exe' "$(wslpath -w "$DIR")"
