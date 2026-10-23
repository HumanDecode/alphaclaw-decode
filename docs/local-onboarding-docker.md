# Test onboarding with local AlphaClaw source

The sibling `../openclaw-railway-template` checkout has a gitignored
`docker-compose.override.yml` that mounts AlphaClaw's `lib/`, `bin/`, and
`package.json` over the installed package. Compose loads it automatically.
Rebuild the UI before starting the container:

```sh
npm run build:ui
cd ../openclaw-railway-template
docker compose up -d --build
```

The image supplies dependencies; source mounts do not upgrade OpenClaw or npm
dependencies. Rebuild the image after changing dependency pins. Use the supported
Node version from the template Dockerfile.

## Fresh onboarding without existing state

For an isolated wizard check, use the same source mounts with a disposable volume
and a different localhost port. This avoids the template's existing volume and
`.env` credentials:

```sh
cd ../openclaw-railway-template
docker build -t alphaclaw-onboarding-check:local .
docker run -d --name alphaclaw-onboarding-check \
  -p 127.0.0.1:3300:3000 \
  -e SETUP_PASSWORD=local-onboarding-check \
  -e ALPHACLAW_ROOT_DIR=/data \
  -v alphaclaw-onboarding-check-data:/data \
  -v "$PWD/../alphaclaw/lib:/app/node_modules/@chrysb/alphaclaw/lib:ro" \
  -v "$PWD/../alphaclaw/bin:/app/node_modules/@chrysb/alphaclaw/bin:ro" \
  -v "$PWD/../alphaclaw/package.json:/app/node_modules/@chrysb/alphaclaw/package.json:ro" \
  alphaclaw-onboarding-check:local
```

Open `http://127.0.0.1:3300` in a fresh browser profile. Check the recommended
models, full-catalog toggle, provider-specific credential fields, and Codex OAuth
panel. Test Back/Next and reload persistence. A complete provisioning test also
requires disposable GitHub/channel credentials and a real provider sign-in;
placeholder credentials only verify UI validation and error handling.

When finished, remove only this test container and volume:

```sh
docker rm -f alphaclaw-onboarding-check
docker volume rm alphaclaw-onboarding-check-data
```
