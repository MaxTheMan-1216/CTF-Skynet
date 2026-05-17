FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server \
    vim \
    nano \
    netcat-openbsd \
    openssl \
    bzip2 \
    xxd \
    file \
    binutils \
    gzip \
    tar \
    curl \
    wget \
    python3 \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /var/run/sshd && ssh-keygen -A

COPY setup/sshd_config /etc/ssh/sshd_config

COPY setup/ /opt/setup/
COPY levels/ /opt/levels/

RUN find /opt -name "*.sh" -exec dos2unix {} \; \
    && find /opt -name "*.txt" -exec dos2unix {} \; \
    && chmod +x /opt/setup/create_levels.sh \
    && find /opt/levels -name "setup.sh" -exec chmod +x {} \; \
    && bash /opt/setup/create_levels.sh

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D"]
