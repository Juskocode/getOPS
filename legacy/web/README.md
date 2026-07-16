# Frontend source

The browser workspace is intentionally dependency-light and compiles into a self-contained, content-addressed release.

- `source.fragment.html` contains application markup, scoped component styles, curriculum data, state transitions, and rendering logic.
- `base.css` contains shared design-system primitives.
- `persistence.js` provides timeout-bounded hydration, ETag revalidation, optimistic writes, and offline fallback.
- `build.mjs` extracts the fragment, vendors Lucide from the locked dependency, hashes assets, precompresses output, and emits the service worker.

Run `npm test` from the repository root after every edit. Do not edit root `index.html` or `dist/`; both are generated.
