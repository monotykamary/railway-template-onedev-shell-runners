FROM docker.io/1dev/agent@sha256:af709472b0181dfa02acefa430900380a4a9c3efacb2ccc747db218044bae96c

USER root
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl git git-lfs libpq-dev libsqlite3-dev \
      libvips-dev nodejs npm postgresql-client python3 python3-pip ruby-full sqlite3 \
    && npm install --global yarn@1.22.22 \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/railway-onedev-agent
RUN chmod 0555 /usr/local/bin/railway-onedev-agent
ENTRYPOINT ["/usr/local/bin/railway-onedev-agent"]
