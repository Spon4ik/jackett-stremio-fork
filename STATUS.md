# Current Status

## Runtime

- Active local addon is running on `http://localhost:7000/manifest.json`.
- The addon uses the local Jackett instance at `http://host.docker.internal:9117/`.
- Watchtower label is enabled on the runtime container.

## Active filters

- `ALLOWED_LANGUAGES=ru,he`
- `MIN_RESOLUTION=720p`
- `REJECT_KEYWORDS` available but not yet enabled in the live container by default

## Project shape

- Narrow self-hosted Stremio addon
- No qBittorrent-specific logic
- No Debrid-specific logic
- Docker-first local workflow

## Pending maintenance work

- Point `origin` to a dedicated fork remote when ready
- Publish a dedicated Docker image if you want Watchtower to track your own releases
- Add regression tests for filter behavior
