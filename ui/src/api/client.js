// Two transports, one interface.
//
// The app runs in two places: against `geo-audit serve` (can start runs) and as
// a static export published to a domain (read-only, no API). Both are built
// from the start so the export is not a rewrite.
//
// Which one is chosen at BUILD time, not runtime: the static build must not
// contain the API client at all, or "the export cannot trigger runs" is a
// promise rather than a structural fact.

const jsonOrThrow = async (res) => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status, detail: body });
  }
  return res.json();
};

/** Live transport — talks to `geo-audit serve`. */
export const apiTransport = {
  readOnly: false,
  index: () => fetch("/api/dashboard/index").then(jsonOrThrow),
  page: (key) => fetch(`/api/dashboard/pages/${key}`).then(jsonOrThrow),
  runs: () => fetch("/api/dashboard/runs").then(jsonOrThrow),
  timeseries: () => fetch("/api/dashboard/timeseries").then(jsonOrThrow),
  targets: () => fetch("/api/targets").then(jsonOrThrow),
  estimate: (body) =>
    fetch("/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow),
  startRun: (body) =>
    fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow),
  runStatus: (handle) => fetch(`/api/runs/${handle}`).then(jsonOrThrow),
  cancelRun: (handle) => fetch(`/api/runs/${handle}/cancel`, { method: "POST" }).then(jsonOrThrow),
};

/** Static transport — sibling JSON next to the exported HTML. No writes exist. */
export const staticTransport = {
  readOnly: true,
  index: () => fetch("./data/index.json").then(jsonOrThrow),
  page: (key) => fetch(`./data/pages/${key}.json`).then(jsonOrThrow),
  runs: () => fetch("./data/runs.json").then(jsonOrThrow),
  timeseries: () => fetch("./data/timeseries.json").then(jsonOrThrow),
  targets: async () => ({ products: [], watchlists: [], pages: [], stages: [] }),
  estimate: async () => {
    throw new Error("this is a read-only published dashboard");
  },
  startRun: async () => {
    throw new Error("this is a read-only published dashboard");
  },
  runStatus: async () => {
    throw new Error("this is a read-only published dashboard");
  },
  cancelRun: async () => {
    throw new Error("this is a read-only published dashboard");
  },
};

// import.meta.env.MODE is resolved at build time, so the unused transport is
// tree-shaken out of the bundle entirely.
export const client = import.meta.env?.MODE === "export" ? staticTransport : apiTransport;
