# EXT Torznab Proxy

EXT Torznab Proxy is a self-hosted Generic Torznab gateway for EXT-style torrent search pages.

It is designed for Prowlarr and uses a FlareSolverr-compatible service internally for Cloudflare/session handling. Users do not need to copy custom Prowlarr definition YAML files. Add it to Prowlarr as a Generic Torznab indexer.

## Features

- Generic Torznab API for Prowlarr
- FlareSolverr-compatible session handling
- Configurable FlareSolverr API URL (including compatible alternatives such as Byparr)
- Internal warm timer
- Search result cache
- Magnet cache
- Direct magnet resolving from torrent detail pages
- Web configuration page
- Turkish/English UI based on browser language
- Docker healthcheck endpoint
- Support for alternate base domains:
  - `https://extranet.torrentbay.st`
  - `https://ext.to`

## Docker Compose

```yaml
services:
  flaresolverr:
    image: ghcr.io/flaresolverr/flaresolverr:latest
    container_name: flaresolverr
    environment:
      - TZ=Europe/Istanbul
    shm_size: "1gb"
    restart: unless-stopped

  extto-torznab-proxy:
    image: ghcr.io/huseyincig/extto-torznab-proxy:latest
    container_name: extto-torznab-proxy
    depends_on:
      - flaresolverr
    environment:
      - TZ=Europe/Istanbul
      - PORT=8998
      - CONFIG_DIR=/config
      - FLARESOLVERR_URL=${FLARESOLVERR_URL:-http://flaresolverr:8191/v1}
    ports:
      - "8998:8998"
    volumes:
      - ./config:/config
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8998/health >/dev/null || exit 1"]
      interval: 120s
      timeout: 10s
      retries: 3
      start_period: 60s
    restart: unless-stopped
```

The proxy reads `FLARESOLVERR_URL` at container startup and applies it to `/config/config.json`. When set in Docker Compose, this environment variable takes precedence over the saved web-UI setting. The default is `http://flaresolverr:8191/v1`.

To use a different FlareSolverr-compatible service (for example, Byparr), point the variable at that service's API endpoint and make sure the proxy can reach it on the Docker network. For example, if the alternative service is named `byparr` in the same Compose project, set:

```yaml
- FLARESOLVERR_URL=http://byparr:8191/v1
```

Also update `depends_on` to reference `byparr` (or omit it if the service is managed outside this Compose project). The alternative must implement the FlareSolverr `/v1` request/session API used by this application.

For a pinned version, use:

```yaml
image: ghcr.io/huseyincig/extto-torznab-proxy:1.0.3
```

## Web UI

Open:

```text
http://YOUR_HOST_IP:8998/
```

Configure:

- Base URL
- Public URL
- FlareSolverr URL (unless overridden by `FLARESOLVERR_URL` in Docker)
- API key
- Warm interval
- Cache TTLs
- Session options

The app creates `/config/config.json` automatically on first start. Do not commit that file to a public repository because it contains your API key and local settings.

## Prowlarr setup

In Prowlarr:

```text
Add Indexer -> Generic Torznab
```

Use:

```text
URL: http://YOUR_HOST_IP:8998
API Path: /api
API Key: shown on the web UI
Redirect: disabled
Tags: optional, for example extto
```

Do not assign a FlareSolverr indexer proxy tag to this Generic Torznab indexer. This container handles the FlareSolverr-compatible service itself.

## Important endpoints

```text
/                 Web UI
/health           Health JSON and Docker healthcheck target
/warm             Manual warm
/cache/clear      Clear search and magnet cache
/session/reset    Reset FlareSolverr session
/api?t=caps       Torznab capabilities
/api?t=search     Torznab search
/download         Magnet redirect endpoint
```

## Notes

- Warm keeps the Cloudflare session active.
- Search cache and magnet cache are separate.
- Magnet resolving is done only when a result is downloaded. Resolved magnets are cached.
- If you change Base URL, it is recommended to clear cache, reset session, and run warm again.
- The app image is published as `ghcr.io/huseyincig/extto-torznab-proxy:latest`.

## Build locally

```sh
docker build -t extto-torznab-proxy:latest .
```

## Publish

This repository includes a GitHub Actions workflow that publishes multi-arch images to GitHub Container Registry:

```text
ghcr.io/huseyincig/extto-torznab-proxy:latest
ghcr.io/huseyincig/extto-torznab-proxy:1.0.3
```

Push a release tag to publish a versioned image:

```sh
git tag v1.0.3
git push origin v1.0.3
```
