# Legacy implementation

This directory contains the v2 local-first implementation retained as a
migration source and temporary fallback.

```text
api/       Python WSGI origin and SQLite validation
deploy/    Retired Python container definition
web/       Generated-fragment browser client
tests/     Legacy browser, build, and persistence contracts
dist/      Generated legacy release; ignored by Git
```

Supported transitional commands:

```bash
npm run legacy:build
npm run legacy:test
npm run legacy:test:server
python3 server.py --port 8767
```

Do not add new product features here. New UI belongs in `apps/web`, new domain
and persistence behavior belongs in `services/api`, and shared contracts belong
in `packages/contracts`. The current Compose stack serves only the generated
legacy browser at `/legacy/`; it does not run the Python image.
