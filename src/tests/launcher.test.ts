// @vitest-environment node
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../../scripts/launcher-core.cjs") as typeof import("../../scripts/launcher-core.cjs");

const INDEX = '<!doctype html><html><head><title>t</title></head><body>app</body></html>';
const files = new Map<string, Buffer>([
  ["index.html", Buffer.from(INDEX)],
  ["assets/app-abc123.js", Buffer.from("console.log(1)")],
  ["assets/app-abc123.css", Buffer.from("body{}")],
  ["favicon.svg", Buffer.from("<svg/>")],
]);

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(port: number, path: string, opts: { method?: string; host?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: opts.method ?? "GET", headers: { Host: opts.host ?? `127.0.0.1:${port}`, ...opts.headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const reads: string[] = [];
let started: Awaited<ReturnType<typeof core.startServer>> & { port: number; server: http.Server };

beforeEach(async () => {
  reads.length = 0;
  const s = await core.startServer({
    manifest: files.keys(),
    readAsset: (k: string) => {
      reads.push(k);
      return files.get(k)!;
    },
    ports: [0],
  });
  started = s as typeof started;
});
afterEach(() => new Promise<void>((r) => started.server.close(() => r())));

describe("serving", () => {
  it("serves the app at / and /index.html with the heartbeat script injected before </head>", async () => {
    for (const p of ["/", "/index.html"]) {
      const r = await request(started.port, p);
      expect(r.status).toBe(200);
      expect(r.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(r.body).toContain('<script src="/__markflow/heartbeat.js"></script></head>');
      expect(r.body).toContain("<body>app</body>");
      expect(r.headers["cache-control"]).toBe("no-store");
    }
  });

  it("serves assets with the right type and long-lived caching for hashed files", async () => {
    const js = await request(started.port, "/assets/app-abc123.js");
    expect(js.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(js.headers["cache-control"]).toContain("immutable");
    expect(js.body).toBe("console.log(1)");
    expect((await request(started.port, "/assets/app-abc123.css")).headers["content-type"]).toBe("text/css; charset=utf-8");
    const svg = await request(started.port, "/favicon.svg");
    expect(svg.headers["content-type"]).toBe("image/svg+xml");
    expect(svg.headers["cache-control"]).toBe("no-cache");
  });

  it("answers HEAD without a body and 404s anything that is not in the manifest", async () => {
    const head = await request(started.port, "/", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect(Number(head.headers["content-length"])).toBeGreaterThan(0);
    expect((await request(started.port, "/nope.js")).status).toBe(404);
    expect((await request(started.port, "/assets/")).status).toBe(404);
  });

  it("sends restrictive security headers on every response", async () => {
    for (const p of ["/", "/assets/app-abc123.js", "/nope", "/__markflow/whoami"]) {
      const h = (await request(started.port, p)).headers;
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("no-referrer");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["cross-origin-resource-policy"]).toBe("same-origin");
      expect(h["content-security-policy"]).toContain("default-src 'self'");
      expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(h["content-security-policy"]).toContain("object-src 'none'");
      expect(h["content-security-policy"]).not.toContain("unsafe-eval");
    }
  });

  it("only ever reads manifest files, whatever path is requested", async () => {
    const attacks = [
      "/../package.json",
      "/%2e%2e/package.json",
      "/%2e%2e%2f%2e%2e%2fWindows/win.ini",
      "/assets/%2e%2e/%2e%2e/secret",
      "//etc/passwd",
      "/..%5c..%5cWindows%5cwin.ini",
      "/index.html%00.png",
      "/%00",
      "/assets/app-abc123.js/../../../x",
      "/C:/Windows/win.ini",
      "/.env",
      "/%E0%A4%A",
    ];
    for (const a of attacks) {
      const r = await request(started.port, a);
      expect([400, 404], a).toContain(r.status);
      expect(r.body).not.toMatch(/root:|\[fonts\]|SECRET/i);
    }
    for (const k of reads) expect(files.has(k), `read of non-manifest key ${k}`).toBe(true);
  });
});

describe("request validation", () => {
  it("rejects foreign Host headers (DNS rebinding) but accepts localhost", async () => {
    expect((await request(started.port, "/", { host: "evil.example.com" })).status).toBe(421);
    expect((await request(started.port, "/", { host: `evil.example.com:${started.port}` })).status).toBe(421);
    expect((await request(started.port, "/", { host: `127.0.0.1:${started.port + 1}` })).status).toBe(421);
    expect((await request(started.port, "/", { host: "127.0.0.1" })).status).toBe(421);
    expect((await request(started.port, "/", { host: `localhost:${started.port}` })).status).toBe(200);
    expect((await request(started.port, "/", { host: `LOCALHOST:${started.port}` })).status).toBe(200);
  });

  it("does not serve even a valid asset to a foreign Host", async () => {
    const r = await request(started.port, "/assets/app-abc123.js", { host: "evil.example.com" });
    expect(r.status).toBe(421);
    expect(r.body).not.toContain("console.log");
  });

  it("allows only GET and HEAD (and the bye beacon)", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const r = await request(started.port, "/", { method });
      expect(r.status, method).toBe(405);
      expect(r.headers.allow).toBe("GET, HEAD");
    }
  });

  it("listens on the loopback interface only", () => {
    const addr = started.server.address() as import("node:net").AddressInfo;
    expect(addr.address).toBe("127.0.0.1");
  });
});

describe("control endpoints", () => {
  it("identifies itself so a second launch can reuse the running instance", async () => {
    const r = await request(started.port, "/__markflow/whoami");
    expect(r.status).toBe(200);
    expect(r.headers["x-markflow"]).toBe("1");
    expect(JSON.parse(r.body)).toEqual({ app: "markflow-studio" });
    expect(await core.probe(started.port)).toBe(true);
  });

  it("a second startServer on the same port reuses the first instead of failing", async () => {
    const second = await core.startServer({ manifest: files.keys(), readAsset: (k: string) => files.get(k)!, ports: [started.port] });
    expect(second).toEqual({ reused: started.port });
  });

  it("probe is false for a port that is closed or owned by another program", async () => {
    expect(await core.probe(1)).toBe(false);
    const other = http.createServer((_q, s) => s.end("hi"));
    await new Promise<void>((r) => other.listen(0, "127.0.0.1", r));
    const p = (other.address() as import("node:net").AddressInfo).port;
    expect(await core.probe(p)).toBe(false);
    await new Promise((r) => other.close(r));
  });

  it("skips a port taken by another program and uses the next candidate", async () => {
    const other = http.createServer((_q, s) => s.end("hi"));
    await new Promise<void>((r) => other.listen(0, "127.0.0.1", r));
    const taken = (other.address() as import("node:net").AddressInfo).port;
    const s = await core.startServer({ manifest: files.keys(), readAsset: (k: string) => files.get(k)!, ports: [taken, 0] });
    expect("port" in s && s.port).not.toBe(taken);
    await new Promise((r) => (s as { server: http.Server }).server.close(r));
    await new Promise((r) => other.close(r));
  });

  it("serves the heartbeat script as JavaScript", async () => {
    const r = await request(started.port, "/__markflow/heartbeat.js");
    expect(r.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(r.body).toContain("/__markflow/");
    expect(r.body).toContain("sendBeacon");
    expect(r.body).toContain("pagehide");
  });

  it("validates ids and rejects cross-site callers", async () => {
    expect((await request(started.port, "/__markflow/ping?id=short")).status).toBe(400);
    expect((await request(started.port, "/__markflow/ping")).status).toBe(400);
    expect((await request(started.port, "/__markflow/ping?id=" + "a".repeat(80))).status).toBe(400);
    expect((await request(started.port, "/__markflow/ping?id=<script>alert(1)</script>")).status).toBe(400);
    const id = "?id=0123456789abcdef";
    expect((await request(started.port, "/__markflow/ping" + id, { headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(403);
    expect((await request(started.port, "/__markflow/bye" + id, { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(403);
    expect((await request(started.port, "/__markflow/ping" + id, { headers: { "Sec-Fetch-Site": "same-origin" } })).status).toBe(204);
    expect((await request(started.port, "/__markflow/bye" + id, { method: "POST", headers: { "Sec-Fetch-Site": "same-origin" } })).status).toBe(204);
    expect((await request(started.port, "/__markflow/unknown")).status).toBe(404);
  });

  it("POST is accepted for the bye beacon only", async () => {
    expect((await request(started.port, "/__markflow/bye?id=0123456789abcdef", { method: "POST" })).status).toBe(204);
    expect((await request(started.port, "/__markflow/ping?id=0123456789abcdef", { method: "POST" })).status).toBe(405);
    expect((await request(started.port, "/assets/app-abc123.js", { method: "POST" })).status).toBe(405);
    expect((await request(started.port, "/", { method: "POST" })).status).toBe(405);
  });
});

describe("lifetime (window closes → server exits)", () => {
  function makeApp(config = {}) {
    let t = 1_000_000;
    const app = core.createApp({
      manifest: ["index.html"],
      readAsset: () => Buffer.from(INDEX),
      getPort: () => 1234,
      now: () => t,
      config: { idleMs: 60_000, byeGraceMs: 10_000, startupMs: 120_000, ...config },
    });
    const ping = (id: string) => app.pages.set(id, t) && void (app.state.everSeen = true, (app.state.emptySince = null));
    return { app, advance: (ms: number) => (t += ms), ping, bye: (id: string) => app.pages.delete(id) && app.pages.size === 0 && (app.state.emptySince = t) };
  }

  it("does not exit while a page is alive", () => {
    const { app, advance, ping } = makeApp();
    ping("page-aaaaaaaa");
    advance(50_000);
    expect(app.shouldExit()).toBe(false);
  });

  it("exits only after the grace period once the last page said goodbye", () => {
    const { app, advance, ping, bye } = makeApp();
    ping("page-aaaaaaaa");
    bye("page-aaaaaaaa");
    advance(9_000);
    expect(app.shouldExit()).toBe(false);
    advance(2_000);
    expect(app.shouldExit()).toBe(true);
  });

  it("survives a page reload (bye then ping within the grace period)", () => {
    const { app, advance, ping, bye } = makeApp();
    ping("page-aaaaaaaa");
    bye("page-aaaaaaaa");
    advance(3_000);
    ping("page-bbbbbbbb");
    advance(30_000);
    ping("page-bbbbbbbb");
    expect(app.shouldExit()).toBe(false);
  });

  it("stays up while any of several windows is open", () => {
    const { app, advance, ping, bye } = makeApp();
    ping("page-aaaaaaaa");
    ping("page-bbbbbbbb");
    bye("page-aaaaaaaa");
    advance(20_000);
    ping("page-bbbbbbbb");
    expect(app.shouldExit()).toBe(false);
    bye("page-bbbbbbbb");
    advance(11_000);
    expect(app.shouldExit()).toBe(true);
  });

  it("drops a page that crashed without saying goodbye after the idle timeout", () => {
    const { app, advance, ping } = makeApp();
    ping("page-aaaaaaaa");
    advance(61_000); // idle > 60s: pruned; then the grace period starts
    expect(app.shouldExit()).toBe(false);
    advance(11_000);
    expect(app.shouldExit()).toBe(true);
  });

  it("gives up if the window never opened at all", () => {
    const { app, advance } = makeApp();
    advance(100_000);
    expect(app.shouldExit()).toBe(false);
    advance(21_000);
    expect(app.shouldExit()).toBe(true);
  });

  it("a background-throttled page (one heartbeat a minute) is not mistaken for a closed one", () => {
    const { app, advance, ping } = makeApp({ idleMs: 180_000 });
    ping("page-aaaaaaaa");
    for (let i = 0; i < 10; i++) {
      advance(60_000);
      expect(app.shouldExit()).toBe(false);
      ping("page-aaaaaaaa");
    }
  });

  it("the watcher calls onIdle once", async () => {
    const { app, advance } = makeApp({ startupMs: 10 });
    advance(1_000);
    const onIdle = vi.fn();
    app.startIdleWatch(onIdle, 5);
    await new Promise((r) => setTimeout(r, 60));
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
