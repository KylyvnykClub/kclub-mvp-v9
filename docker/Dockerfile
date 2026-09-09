# syntax=docker/dockerfile:1

# The image the whole local stack runs on: the application, the Upstash
# stand-in and the database bootstrap all use it, so there is one Node and one
# pnpm to keep in step. Source is bind-mounted at run time (docker-compose.yml)
# rather than copied, so an edit on the host is one restart away from running.
FROM node:22-bookworm-slim

# argon2 and sharp publish prebuilt binaries for linux/amd64 glibc; the
# toolchain is here for the architectures where they do not - an arm64 laptop
# builds both from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      g++ \
      make \
      python3 \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    # There is no .git in the image, and husky's install hook fails without one.
    HUSKY=0

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

# Dependencies as their own layer, so a source edit does not reinstall them.
# The named node_modules volume is seeded from this layer the first time the
# stack comes up.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY docker/entrypoint.sh /usr/local/bin/kclub-entrypoint
RUN chmod +x /usr/local/bin/kclub-entrypoint

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/kclub-entrypoint"]
