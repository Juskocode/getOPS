# Private Cloudflare Preview

The React release, C++ API, and PostgreSQL remain in the existing loopback-bound
Compose stack. A small Node gateway protects workspace routes before proxying to
Nginx. The standalone `/lab/galton` page and its static assets are public and do
not load any profile or call the API. All study/profile/control routes still
require authentication. The gateway does not replace the C++ backend or store
study progress.

```sh
./scripts/compose.sh up --build -d edge
npm run preview:test
npm run preview:start
npm run preview:status
```

Open `/lab/galton` on the returned HTTPS URL without signing in. For the training
workspace, use the username and random password in
`.runtime/preview/access.json` when the browser prompts. Credentials, logs, and
runtime metadata are ignored by Git; the credentials file is owner-readable
only. Never post it in a PR. All authenticated visitors share this personal
workspace, so share credentials only with people allowed to read and edit it.

The gateway binds to `127.0.0.1:18766` by default. Override
`GETOPS_PREVIEW_PORT` or `GETOPS_PREVIEW_ORIGIN` at startup for another local
stack. The origin must be loopback HTTP. Anonymous workspace, profile API,
source-map, and diagnostic requests receive 401. Cross-site writes are rejected; proxy
credentials and incoming forwarding headers are stripped. Requests have body
and timeout limits. Remote responses are private/no-store.

The detached supervisor survives terminal closure and restarts its own
cloudflared child after a connection-process failure. It does not alter existing
Cloudflare tunnels or user configuration. It does not start on machine reboot.
Quick Tunnel hostnames can change when the connector restarts; read the current
URL with `npm run preview:status`. The machine, Docker stack, and supervisor must
stay running. Quick Tunnels are temporary previews, not a production hosting SLA.
See [Cloudflare's limitations](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

```sh
npm run preview:stop
```

This stops only this workspace's authenticated, instance-verified supervisor and
its connector, leaving Docker and other tunnels untouched. To rotate access,
stop the preview, delete only `.runtime/preview/access.json`, and start again.

## Verification

- `npm run preview:test`: no anonymous upstream requests, valid authentication,
  protected control route, origin isolation, CSRF denial, header stripping,
  preserved If-Match, body limit, and unavailable-origin response.
- Check `/lab/galton` returns 200 without credentials and requests no private API.
- Check profile endpoints return 401 without credentials and 200 with credentials.
- Check authenticated `/api/v1/health/ready` and `/lab/galton` through the public
  hostname. Local health alone is not evidence of tunnel availability.

With Playwright and Chrome installed, run `npm run preview:browser` against the
local release. `GETOPS_PLAYWRIGHT_MODULE` accepts an installed Playwright module
path and `GETOPS_QA_URL` selects another origin. This check uses a fresh browser
context and never submits study evidence. It verifies 50,000 settled outcomes,
CSV counts, settings restore, pause, reduced motion, desktop/mobile screenshots,
canvas pixels after resize, and console errors. Screenshots stay in
`.runtime/qa`, outside Git and container build contexts.

## Galton Lab

The lab simulates all configured trials (up to 50,000). The animation renders a
bounded sample of their decision paths, not 50,000 physical collision bodies.
Every trial is counted only after its cohort lands, including during speed
changes. Animation state pauses with the page hidden; settled boards redraw on
resize. Reduced motion suppresses animated traces without changing outcomes.
Applied field settings persist per browser origin, separate from PostgreSQL
study evidence. CSV export includes partial/final settled counts, expected
probabilities, and all parameters needed to replay the deterministic run.
