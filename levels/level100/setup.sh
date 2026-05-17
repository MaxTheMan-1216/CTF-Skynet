#!/bin/bash
LEVEL_USER="$1"
NEXT_PASS="$2"
HOME_DIR="/home/$LEVEL_USER"

echo "$NEXT_PASS" > "$HOME_DIR/readme.txt"
chown "${LEVEL_USER}:${LEVEL_USER}" "$HOME_DIR/readme.txt"
chmod 640 "$HOME_DIR/readme.txt"
