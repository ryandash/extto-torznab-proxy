FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY --chmod=755 docker-entrypoint.sh ./

ENV NODE_ENV=production
ENV CONFIG_DIR=/config

EXPOSE 8998

VOLUME ["/config"]

ENTRYPOINT ["./docker-entrypoint.sh"]
