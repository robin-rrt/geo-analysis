// Local server: serves the dashboard and lets a browser start runs.
//
// SECURITY POSTURE — the part not to get wrong.
//
// This server is NEVER the thing on a public domain. The public artifact is the
// static export, which has no API and cannot start a job. Here:
//
//   * it binds 127.0.0.1 by default, not 0.0.0.0
//   * the API key stays in this process; no response or log line carries it
//   * no endpoint accepts a shell command — a target is validated against the
//     resolver and never interpolated into a shell
//   * the cost ceiling is enforced server-side and cannot be raised by a client
//
// Progress is polled rather than streamed. For one user on localhost watching a
// 7-40 minute job, a 2s poll is indistinguishable from SSE and removes a
// connection registry, heartbeats, reconnection handling, and a failure mode
// where a dead stream looks exactly like a running job.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { JobManager } from "./jobs.js";
import { redact } from "./redact.js";
import { listProducts, sitemapUrls } from "../product/resolve.js";
import { WATCHLIST_DIR } from "../target/watchlist.js";
import { ALL_STAGES } from "../run/estimate.js";
import { DASHBOARD_DIR } from "../store/run.js";

export const DEFAULT_PORT = 4317;
export const LOOPBACK = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const json = (res, status, body) => {
  const text = redact(JSON.stringify(body ?? null));
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(text);
};

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("request body too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid JSON body"), { status: 400 });
  }
}

/** Serve a file from a directory, refusing to escape it. */
function serveStatic(res, rootDir, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, "")) || "index.html";
  const resolved = path.resolve(rootDir, rel);
  // Path traversal guard: a request for ../../etc/passwd must not escape.
  if (!resolved.startsWith(path.resolve(rootDir) + path.sep) && resolved !== path.resolve(rootDir)) {
    res.writeHead(403).end("forbidden");
    return true;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false;
  res.writeHead(200, { "content-type": MIME[path.extname(resolved)] ?? "application/octet-stream" });
  fs.createReadStream(resolved).pipe(res);
  return true;
}

export function createServer({ root = "results", uiDir = null, env = process.env, jobs = null } = {}) {
  const manager = jobs ?? new JobManager({ root, env });

  const routes = {
    "GET /api/health": async () => ({ ok: true, interrupted: manager.interrupted }),

    "GET /api/targets": async () => {
      const [products, sitemap] = await Promise.all([
        listProducts().catch(() => []),
        sitemapUrls("https://docs.chain.link").catch(() => []),
      ]);
      const watchlists = fs.existsSync(WATCHLIST_DIR)
        ? fs.readdirSync(WATCHLIST_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
        : [];
      // Sitemap URLs back the single-page picker's autocomplete.
      return { products, watchlists, pages: sitemap, stages: ALL_STAGES };
    },

    "POST /api/estimate": async (body) => {
      const { target, estimate } = await manager.estimate(body);
      return { pageCount: target.pages.length, estimate, ledger: target.counts };
    },

    "POST /api/runs": async (body) => manager.start(body),

    "GET /api/runs": async () => ({ runs: manager.history() }),

    // What is running right now, from ANY process — including the terminal.
    "GET /api/active": async () => ({ active: manager.active() }),
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
      const key = `${req.method} ${url.pathname}`;

      if (routes[key]) {
        const body = req.method === "POST" ? await readBody(req) : null;
        return json(res, 200, await routes[key](body));
      }

      // /api/runs/:handle and /api/runs/:handle/cancel
      const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)(\/cancel)?$/);
      if (runMatch) {
        const [, id, cancel] = runMatch;
        if (cancel && req.method === "POST") {
          return json(res, manager.cancel(id) ? 200 : 404, { cancelled: manager.cancel(id) });
        }
        if (req.method === "GET") {
          const live = manager.status(id);
          if (live) return json(res, 200, live);
          const manifest = manager.run(id);
          return manifest ? json(res, 200, manifest) : json(res, 404, { error: "no such run" });
        }
      }

      // Projections, read straight off disk.
      const dash = url.pathname.match(/^\/api\/dashboard\/(index|runs|timeseries|products)$/);
      if (dash && req.method === "GET") {
        const file = path.join(root, DASHBOARD_DIR, `${dash[1]}.json`);
        if (!fs.existsSync(file)) return json(res, 404, { error: `no ${dash[1]} projection yet — run something first` });
        return json(res, 200, JSON.parse(fs.readFileSync(file, "utf8")));
      }
      const runDetail = url.pathname.match(/^\/api\/dashboard\/runs\/([A-Za-z0-9._-]+)$/);
      if (runDetail && req.method === "GET") {
        const file = path.join(root, DASHBOARD_DIR, "runs", `${runDetail[1]}.json`);
        if (!fs.existsSync(file)) return json(res, 404, { error: "no such run" });
        return json(res, 200, JSON.parse(fs.readFileSync(file, "utf8")));
      }

      const pageMatch = url.pathname.match(/^\/api\/dashboard\/pages\/([A-Za-z0-9-]+)$/);
      if (pageMatch && req.method === "GET") {
        const file = path.join(root, DASHBOARD_DIR, "pages", `${pageMatch[1]}.json`);
        if (!fs.existsSync(file)) return json(res, 404, { error: "no such page" });
        return json(res, 200, JSON.parse(fs.readFileSync(file, "utf8")));
      }

      if (req.method === "GET" && uiDir && serveStatic(res, uiDir, url.pathname)) return;
      // SPA fallback so client-side routes deep-link.
      if (req.method === "GET" && uiDir && fs.existsSync(path.join(uiDir, "index.html"))) {
        res.writeHead(200, { "content-type": MIME[".html"] });
        return fs.createReadStream(path.join(uiDir, "index.html")).pipe(res);
      }

      json(res, 404, { error: "not found" });
    } catch (err) {
      // Errors are redacted before they leave: an upstream failure can echo a
      // request that contained the key.
      json(res, err?.status ?? 500, { error: redact(err?.message ?? String(err), env), ...(err?.detail ?? {}) });
    }
  });

  server.manager = manager;
  return server;
}

export function startServer({ port = DEFAULT_PORT, host = LOOPBACK, root = "results", uiDir = null, log = () => {} } = {}) {
  const server = createServer({ root, uiDir });
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      log(`geo-audit serve — http://${host}:${port}\n`);
      if (host !== LOOPBACK) {
        log(
          `\n  WARNING: bound to ${host}, not loopback.\n` +
            `  Anyone who can reach this port can start runs that spend your Anthropic budget\n` +
            `  (a full-site sweep is ~$250). Publish the static export instead — it has no API.\n\n`,
        );
      }
      resolve(server);
    });
  });
}
