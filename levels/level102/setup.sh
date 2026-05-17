#!/bin/bash
LEVEL_USER="$1"
NEXT_PASS="$2"
HOME_DIR="/home/$LEVEL_USER"

echo "$NEXT_PASS" > "$HOME_DIR/my secret file.txt"
chown "${LEVEL_USER}:${LEVEL_USER}" "$HOME_DIR/my secret file.txt"
chmod 640 "$HOME_DIR/my secret file.txt"
