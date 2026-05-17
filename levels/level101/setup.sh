#!/bin/bash
LEVEL_USER="$1"
NEXT_PASS="$2"
HOME_DIR="/home/$LEVEL_USER"

echo "Just some notes..." > "$HOME_DIR/notes.txt"
echo "Buy milk, do homework" > "$HOME_DIR/todo.txt"
echo "$NEXT_PASS" > "$HOME_DIR/.hidden_treasure"

chown "${LEVEL_USER}:${LEVEL_USER}" "$HOME_DIR/notes.txt" "$HOME_DIR/todo.txt" "$HOME_DIR/.hidden_treasure"
chmod 644 "$HOME_DIR/notes.txt" "$HOME_DIR/todo.txt"
chmod 640 "$HOME_DIR/.hidden_treasure"
