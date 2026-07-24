FROM 1dev/agent@sha256:9fa0293bf046b95be2e530d341a4f4664b83489b4096c65d784f6d7306977fc8

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
