# CTF Challenge

A Bandit-style SSH CTF for learning Linux terminal skills.

## Quick Start

```bash
docker compose up --build -d
```

Connect as the first player:

```bash
ssh level100@localhost -p 2222
# Password: level100
```

## Structure

```
.
├── Dockerfile
├── docker-compose.yml
├── setup/
│   ├── create_levels.sh    # Creates all user accounts and puzzle files
│   ├── passwords.txt       # Level passwords (gitignored!)
│   └── sshd_config
├── levels/
│   └── levelNNN/
│       ├── README.md       # Shown to player on login
│       ├── setup.sh        # Creates puzzle files in /home/levelNNN
│       └── solution.md     # Intended solution (gitignored!)
└── web/
    └── index.html
```

## Adding a Level

1. Create `levels/levelNNN/` with `README.md`, `setup.sh`, `solution.md`
2. Add `levelNNN:<password>` to `setup/passwords.txt`
3. Rebuild: `docker compose up --build -d`

## Stopping

```bash
docker compose down
```
