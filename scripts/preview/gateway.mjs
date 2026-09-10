import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, request } from "node:http";

const digest = (value) => createHash("sha256").update(value).digest();
const hopHeaders = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];

export function createPreviewGateway({ origin, username, password, status = () => ({ ready: true }) }) {
  const upstream = new URL(origin);
  if (upstream.protocol !== "http:" || upstream.hostname !== "127.0.0.1") throw new Error("Preview origin must be loopback HTTP.");
  if (!username || !password || password.length < 24) throw new Error("A strong preview credential is required.");
  const expected = digest(`Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);
  return createServer({ requestTimeout: 30_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    const fail = (code, message) => { res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" }); res.end(message); };
    if (!timingSafeEqual(digest(req.headers.authorization ?? ""), expected)) {
      res.setHeader("WWW-Authenticate", 'Basic realm="getOPS private preview", charset="UTF-8"');
      fail(401, "Sign in to getOPS with your preview credentials.");
      return;
    }
    if (!req.url?.startsWith("/") || req.url.startsWith("//")) { fail(400, "Invalid request path."); return; }
    if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(req.method)) { fail(405, "Method not allowed."); return; }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      let sameOrigin = true;
      try { if (req.headers.origin) sameOrigin = new URL(req.headers.origin).host === req.headers.host; }
      catch { sameOrigin = false; }
      if (!sameOrigin || req.headers["sec-fetch-site"] === "cross-site") { fail(403, "Cross-site writes are blocked."); return; }
    }
    if (req.url === "/__preview/status") {
      if (req.method !== "GET") { fail(405, "Method not allowed."); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status()));
      return;
    }
    if (Number(req.headers["content-length"] ?? 0) > 2 * 1024 * 1024) { fail(413, "Request body too large."); return; }
    const headers = { ...req.headers, host: upstream.host };
    for (const name of [...hopHeaders, ...(req.headers.connection ?? "").split(",").map((name) => name.trim().toLowerCase())]) delete headers[name];
    for (const name of Object.keys(headers)) {
      if (name === "authorization" || name === "cookie" || name === "forwarded" || name.startsWith("x-forwarded-") || name.startsWith("cf-")) delete headers[name];
    }
    const proxy = request({ hostname: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers }, (response) => {
      const responseHeaders = { ...response.headers, "cache-control": "private, no-store" };
      for (const name of hopHeaders) delete responseHeaders[name];
      res.writeHead(response.statusCode ?? 502, responseHeaders);
      response.pipe(res);
    });
    proxy.setTimeout(15_000, () => proxy.destroy(new Error("Origin timeout")));
    proxy.on("error", () => {
      if (res.writableEnded || res.destroyed) return;
      if (!res.headersSent) fail(502, "getOPS is temporarily unavailable. Try again shortly.");
      else res.destroy();
    });
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > 2 * 1024 * 1024) {
        req.unpipe(proxy);
        if (!res.headersSent) fail(413, "Request body too large.");
        proxy.destroy();
      }
    });
    req.on("aborted", () => proxy.destroy());
    res.on("close", () => proxy.destroy());
    req.pipe(proxy);
  });
}
