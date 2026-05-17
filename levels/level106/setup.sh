#!/bin/bash
LEVEL_USER="$1"
HOME_DIR="/home/$LEVEL_USER"

echo "Congratulations! You have completed the CTF challenge!" > "$HOME_DIR/flag.txt"
chown "${LEVEL_USER}:${LEVEL_USER}" "$HOME_DIR/flag.txt"
chmod 644 "$HOME_DIR/flag.txt"
