#!/bin/bash
set -e

SETUP_DIR="/opt/setup"
LEVELS_DIR="/opt/levels"

declare -A PASSWORDS
while IFS=':' read -r user pass; do
    [[ "$user" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$user" ]] && continue
    PASSWORDS["$user"]="$pass"
done < "$SETUP_DIR/passwords.txt"

mapfile -t LEVELS < <(
    find "$LEVELS_DIR" -maxdepth 1 -name 'level*' -type d | sort | while read -r d; do
        basename "$d"
    done
)

for i in "${!LEVELS[@]}"; do
    level="${LEVELS[$i]}"

    useradd -m -s /bin/bash "$level" 2>/dev/null || true
    echo "${level}:${PASSWORDS[$level]}" | chpasswd
    chmod 700 "/home/$level"

    if [ -f "$LEVELS_DIR/$level/README.md" ]; then
        cp "$LEVELS_DIR/$level/README.md" "/home/$level/README.md"
        chown "${level}:${level}" "/home/$level/README.md"
        chmod 644 "/home/$level/README.md"
    fi

    cat >> "/home/$level/.bashrc" << 'BASHRC'

if [ -f ~/README.md ]; then
    echo ""
    cat ~/README.md
    echo ""
fi
BASHRC
    chown "${level}:${level}" "/home/$level/.bashrc"

    next_password=""
    if [ $((i + 1)) -lt ${#LEVELS[@]} ]; then
        next_level="${LEVELS[$((i + 1))]}"
        next_password="${PASSWORDS[$next_level]}"
    fi

    level_setup="$LEVELS_DIR/$level/setup.sh"
    if [ -f "$level_setup" ]; then
        bash "$level_setup" "$level" "$next_password"
    fi
done

echo "All levels created successfully."
