#!/bin/bash
LEVEL_USER="$1"
NEXT_PASS="$2"
HOME_DIR="/home/$LEVEL_USER"

DATA_DIR="$HOME_DIR/data"
mkdir -p "$DATA_DIR"

for i in $(seq 1 14); do
    dd if=/dev/urandom bs=128 count=1 2>/dev/null > "$DATA_DIR/file$i"
done

LUCKY=$((RANDOM % 14 + 1))
echo "$NEXT_PASS" > "$DATA_DIR/file$LUCKY"

chown -R "${LEVEL_USER}:${LEVEL_USER}" "$DATA_DIR"
chmod 750 "$DATA_DIR"
chmod 640 "$DATA_DIR"/file*
