# Maintenance Guide

## Common commands

- `npm run docker:up`
- `npm run docker:down`
- `npm run docker:logs`
- `npm run docker:build`

## Update flow

1. Change code or `.env`
2. Run `npm run docker:up`
3. Verify `http://localhost:7000/manifest.json`
4. Test in Stremio

## Remote/release readiness

- Replace the placeholder repository URLs in `package.json`
- Point git `origin` to your own repository
- Publish your own Docker image if you want remote auto-updates to follow your fork
