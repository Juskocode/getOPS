# Test map

- `test_frontend_contract.mjs` protects state transitions and user-facing learning contracts in the browser source.
- `test_build_contract.mjs` protects hashing, compression, CSP, service-worker behavior, and release composition.
- `test_server.py` exercises state validation, optimistic concurrency, persistence, backup integrity, and HTTP security behavior.

The release gate is the combination of `npm test`, Python unit tests, Compose configuration validation, production smoke, and isolated desktop/mobile browser QA.
