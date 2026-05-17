#!/bin/bash
LEVEL_USER="$1"
NEXT_PASS="$2"
HOME_DIR="/home/$LEVEL_USER"
WORK_DIR=$(mktemp -d)

echo "$NEXT_PASS" > "$WORK_DIR/data"
gzip "$WORK_DIR/data"
bzip2 "$WORK_DIR/data.gz"

cp "$WORK_DIR/data.gz.bz2" "$HOME_DIR/compressed_data"
rm -rf "$WORK_DIR"

chown "${LEVEL_USER}:${LEVEL_USER}" "$HOME_DIR/compressed_data"
chmod 640 "$HOME_DIR/compressed_data"
