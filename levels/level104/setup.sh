#!/bin/bash
LEVEL_USER="$1"
NEXT_PASS="$2"
HOME_DIR="/home/$LEVEL_USER"

echo "$NEXT_PASS" | base64 > "$HOME_DIR/data.txt"
chown "${LEVEL_USER}:${LEVEL_USER}" "$HOME_DIR/data.txt"
chmod 640 "$HOME_DIR/data.txt"
