import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createPreviewGateway } from "./gateway.mjs";

const password = "test-only-credential-that-is-not-used-live";
const authorization = `Basic ${Buffer.from(`operator:${password}`).toString("base64")}`;

test("private preview protects HTML, API, and control routes", async (t) => {
  let requests = 0;
  const upstream = createServer((req, res) => {
    requests++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ path: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie, forwarded: req.headers["x-forwarded-for"], ifMatch: req.headers["if-match"] }));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const gateway = createPreviewGateway({ origin: `http://127.0.0.1:${upstream.address().port}`, username: "operator", password });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const base = `http://127.0.0.1:${gateway.address().port}`;

  for (const path of ["/", "/api/v1/profiles/local/state", "/__preview/status", "/legacy/"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate"), /Basic/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal((await fetch(base, { headers: { authorization: "Basic bad" } })).status, 401);
  assert.equal(requests, 0);

  const response = await fetch(base + "/api/v1/profiles/local/state?test=1", { headers: { authorization, cookie: "secret=private", "x-forwarded-for": "spoofed", "if-match": '"state-local-r8"' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { path: "/api/v1/profiles/local/state?test=1", ifMatch: '"state-local-r8"' });
  assert.equal((await fetch(base + "/__preview/status", { headers: { authorization } })).status, 200);
  assert.equal((await fetch(base, { method: "POST", headers: { authorization, origin: "https://unrelated.example" }, body: "{}" })).status, 403);
  assert.equal((await fetch(base, { method: "POST", headers: { authorization, "sec-fetch-site": "cross-site" }, body: "{}" })).status, 403);
  assert.equal((await fetch(base, { method: "POST", headers: { authorization, origin: base }, body: "{}" })).status, 200);
  assert.equal((await fetch(base, { method: "PUT", headers: { authorization }, body: "x".repeat(2 * 1024 * 1024 + 1) })).status, 413);
  assert.throws(() => createPreviewGateway({ origin: "http://example.com", username: "operator", password }), /loopback/);
  assert.throws(() => createPreviewGateway({ origin: base, username: "operator", password: "short" }), /strong/);
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
  assert.equal((await fetch(base, { headers: { authorization } })).status, 502);
});
