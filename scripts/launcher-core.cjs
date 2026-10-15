"use strict";
/**
 * Local static server for the packaged MarkFlow Studio app.
 *
 * Security model:
 *  - binds to 127.0.0.1 only (never reachable from the network);
 *  - rejects any Host header other than 127.0.0.1:<port> / localhost:<port> (DNS-rebinding defence);
 *  - serves only files listed in the manifest, looked up by exact key, so there is no file-system
 *    path handling at all and path traversal is impossible by construction;
 *  - GET/HEAD only, plus POST for the same-origin "bye" beacon;
 *  - sends restrictive headers (CSP incl. frame-ancestors, nosniff, no-referrer, same-origin resources).
 *
 * Lifetime: the page reports in with a heartbeat. The server exits shortly after the last page says
 * goodbye (or goes quiet), so closing the app window also ends the background process.
 */
const http = require("node:http");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Runs in the page: registers with the server, keeps it alive, and says goodbye on close. */
const HEARTBEAT_JS = `(function () {
  var id = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  var base = "/__markflow/";
  function ping() { try { fetch(base + "ping?id=" + id, { cache: "no-store", keepalive: true }).catch(function () {}); } catch (e) {} }
  function bye() { try { navigator.sendBeacon(base + "bye?id=" + id); } catch (e) {} }
  ping();
  setInterval(ping, 5000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") ping(); });
  window.addEventListener("pageshow", ping);
  window.addEventListener("pagehide", bye);
})();
`;

const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function extensionOf(key) {
  const i = key.lastIndexOf(".");
  return i < 0 ? "" : key.slice(i).toLowerCase();
}

/**
 * @param {object} opts
 * @param {Iterable<string>} opts.manifest   keys of the files that may be served (e.g. "index.html", "assets/a.js")
 * @param {(key: string) => Buffer} opts.readAsset
 * @param {() => number} opts.getPort        the port the server is listening on (for the Host check)
 * @param {() => number} [opts.now]
 * @param {{idleMs?: number, byeGraceMs?: number, startupMs?: number}} [opts.config]
 */
function createApp({ manifest, readAsset, getPort, now = Date.now, config = {} }) {
  const cfg = { idleMs: 180000, byeGraceMs: 10000, startupMs: 120000, ...config };
  const keys = new Set(manifest);
  const pages = new Map(); // page id -> last heartbeat time
  const state = { startedAt: now(), everSeen: false, emptySince: null };

  const hostAllowed = (host) => {
    const port = getPort();
    return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  };

  function baseHeaders(type) {
    return {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": CSP,
      "X-MarkFlow": "1",
    };
  }

  function send(req, res, status, type, body, extra = {}) {
    const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    res.writeHead(status, { ...baseHeaders(type), "Content-Length": buf.length, ...extra });
    res.end(req.method === "HEAD" ? undefined : buf);
  }

  const sameOriginOrDirect = (req) => {
    const site = req.headers["sec-fetch-site"];
    return site === undefined || site === "same-origin" || site === "none";
  };

  function control(req, res, url) {
    const name = url.pathname.slice("/__markflow/".length);
    if (name === "whoami") return send(req, res, 200, "application/json; charset=utf-8", JSON.stringify({ app: "markflow-studio" }), { "Cache-Control": "no-store" });
    if (name === "heartbeat.js") return send(req, res, 200, MIME[".js"], HEARTBEAT_JS, { "Cache-Control": "no-store" });
    if (name === "ping" || name === "bye") {
      if (!sameOriginOrDirect(req)) return send(req, res, 403, "text/plain; charset=utf-8", "forbidden");
      const id = url.searchParams.get("id") ?? "";
      if (!ID_PATTERN.test(id)) return send(req, res, 400, "text/plain; charset=utf-8", "bad id");
      if (name === "ping") {
        pages.set(id, now());
        state.everSeen = true;
        state.emptySince = null;
      } else if (pages.delete(id) && pages.size === 0) {
        state.emptySince = now();
      }
      return send(req, res, 204, "text/plain; charset=utf-8", "", { "Cache-Control": "no-store" });
    }
    return send(req, res, 404, "text/plain; charset=utf-8", "not found");
  }

  function handler(req, res) {
    try {
      const isPostBye = req.method === "POST" && (req.url ?? "").startsWith("/__markflow/bye");
      if (req.method !== "GET" && req.method !== "HEAD" && !isPostBye) {
        return send(req, res, 405, "text/plain; charset=utf-8", "method not allowed", { Allow: "GET, HEAD" });
      }
      if (!hostAllowed(String(req.headers.host ?? "").toLowerCase())) {
        return send(req, res, 421, "text/plain; charset=utf-8", "misdirected request");
      }
      let url;
      let pathname;
      try {
        url = new URL(req.url ?? "/", "http://localhost");
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return send(req, res, 400, "text/plain; charset=utf-8", "bad request");
      }
      if (pathname.startsWith("/__markflow/")) return control(req, res, url);
      if (isPostBye) return send(req, res, 405, "text/plain; charset=utf-8", "method not allowed");

      const key = pathname === "/" ? "index.html" : pathname.slice(1);
      if (key.includes("\0") || !keys.has(key)) return send(req, res, 404, "text/plain; charset=utf-8", "not found");

      let body = readAsset(key);
      const ext = extensionOf(key);
      if (key === "index.html") {
        body = Buffer.from(Buffer.from(body).toString("utf8").replace("</head>", '<script src="/__markflow/heartbeat.js"></script></head>'), "utf8");
      }
      const cache = key === "index.html" ? "no-store" : key.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
      return send(req, res, 200, MIME[ext] ?? "application/octet-stream", Buffer.from(body), { "Cache-Control": cache });
    } catch {
      return send(req, res, 500, "text/plain; charset=utf-8", "internal error");
    }
  }

  /** True once every page has said goodbye (or gone quiet) and the grace period has passed. */
  function shouldExit() {
    const t = now();
    for (const [id, seen] of pages) if (t - seen > cfg.idleMs) pages.delete(id);
    if (pages.size > 0) {
      state.emptySince = null;
      return false;
    }
    if (!state.everSeen) return t - state.startedAt > cfg.startupMs; // the window never opened
    if (state.emptySince === null) state.emptySince = t;
    return t - state.emptySince > cfg.byeGraceMs;
  }

  function startIdleWatch(onIdle, intervalMs = 2000) {
    const timer = setInterval(() => {
      if (shouldExit()) {
        clearInterval(timer);
        onIdle();
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }

  return { handler, shouldExit, startIdleWatch, state, pages };
}

function listenOn(server, port, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const onError = (e) => reject(e);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      resolve(server.address().port);
    });
  });
}

/** Is a MarkFlow Studio server already answering on this port? */
function probe(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/__markflow/whoami", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.headers["x-markflow"] === "1" && res.statusCode === 200);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });
}

/**
 * Start serving, or detect that an instance is already running (so a second double-click just opens
 * another window instead of failing). Returns `{ reused: port }` or `{ port, server, app }`.
 */
async function startServer({ manifest, readAsset, ports, config, onIdle }) {
  let port = 0;
  const app = createApp({ manifest, readAsset, getPort: () => port, config });
  for (const candidate of ports) {
    if (candidate !== 0 && (await probe(candidate))) return { reused: candidate };
    const server = http.createServer(app.handler);
    server.headersTimeout = 10000;
    server.requestTimeout = 15000;
    try {
      port = await listenOn(server, candidate);
    } catch (e) {
      if (e && (e.code === "EADDRINUSE" || e.code === "EACCES")) continue;
      throw e;
    }
    if (onIdle) app.startIdleWatch(onIdle);
    return { port, server, app };
  }
  throw new Error("No free port available / 找不到可用的連接埠");
}

module.exports = { createApp, startServer, probe, listenOn, HEARTBEAT_JS, CSP, MIME };
