import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseTargetSpec, resolveTarget, TARGET_TYPES, makeTarget } from "../src/target/index.js";
import { validateWatchlist, resolveWatchlistTarget } from "../src/target/watchlist.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "geo-target-"));

function writeWatchlist(dir, name, doc) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(doc));
}

const valid = {
  version: 1,
  name: "wl",
  pages: ["https://docs.chain.link/a", "https://docs.chain.link/b"],
};

test("target specs split on the first colon so URLs survive", () => {
  assert.deepEqual(parseTargetSpec("product:vrf"), { type: "product", rest: "vrf" });
  // A naive split(":") would yield "https" here.
  assert.deepEqual(parseTargetSpec("page:https://docs.chain.link/ace"), {
    type: "page",
    rest: "https://docs.chain.link/ace",
  });
});

test("target specs are rejected clearly when malformed", () => {
  assert.throws(() => parseTargetSpec("vrf"), /no type prefix/);
  assert.throws(() => parseTargetSpec("nope:x"), /unknown target type/);
  assert.throws(() => parseTargetSpec("product:"), /missing a name/);
  assert.throws(() => parseTargetSpec(""), /empty target/);
});

test("every target type produces the identical shape — nothing downstream may special-case one", async () => {
  const dir = tmp();
  writeWatchlist(path.join(dir, "watchlists"), "wl", valid);

  const page = await resolveTarget("page:https://docs.chain.link/ace");
  const watchlist = await resolveTarget("watchlist:wl", { watchlistDir: path.join(dir, "watchlists") });

  const shape = (t) => Object.keys(t).sort();
  assert.deepEqual(shape(page), shape(watchlist), "target shapes diverged");
  for (const t of [page, watchlist]) {
    assert.ok(Array.isArray(t.pages) && t.pages.length);
    assert.ok(Array.isArray(t.ledger));
    assert.equal(t.counts.inScope, t.pages.length);
    assert.ok(TARGET_TYPES.includes(t.type));
  }
});

test("the ledger accounts for every URL considered, with a reason when excluded", () => {
  // Mirrors what resolveProduct emits, which is what the product target passes through.
  const t = makeTarget({
    type: "product",
    name: "vrf",
    pages: [{ url: "https://x/a" }],
    ledger: [
      { url: "https://x/a", included: true },
      { url: "https://x/b", included: false, reason: "not-in-curated-index" },
    ],
  });
  assert.equal(t.counts.discovered, 2);
  assert.equal(t.counts.inScope, 1);
  assert.equal(t.ledger.find((p) => !p.included).reason, "not-in-curated-index");
});

// ------------------------------------------------------------- watchlist ---

test("watchlist rejects an unsupported version", () => {
  assert.throws(() => validateWatchlist({ ...valid, version: 99 }), /unsupported version/);
  assert.throws(() => validateWatchlist({ ...valid, version: undefined }), /unsupported version/);
});

test("watchlist rejects duplicate URLs — they would double-count in every aggregate", () => {
  assert.throws(
    () => validateWatchlist({ ...valid, pages: ["https://docs.chain.link/a", "https://docs.chain.link/a"] }),
    /duplicate URL/,
  );
});

test("watchlist rejects off-origin URLs when an origin is given", () => {
  assert.throws(
    () => validateWatchlist({ ...valid, pages: ["https://evil.example/x"] }, { origin: "https://docs.chain.link" }),
    /not on https:\/\/docs\.chain\.link/,
  );
  // With no origin constraint the same document is fine.
  assert.ok(validateWatchlist({ ...valid, pages: ["https://evil.example/x"] }).pages.length);
});

test("watchlist rejects malformed entries", () => {
  assert.throws(() => validateWatchlist({ ...valid, pages: [] }), /non-empty array/);
  assert.throws(() => validateWatchlist({ ...valid, pages: ["not a url"] }), /not a valid URL/);
  assert.throws(() => validateWatchlist({ ...valid, pages: [42] }), /must be a URL string/);
  assert.throws(() => validateWatchlist({ ...valid, name: undefined }), /missing "name"/);
});

test("a missing watchlist names the ones that exist", () => {
  const dir = path.join(tmp(), "watchlists");
  writeWatchlist(dir, "release-critical", valid);
  assert.throws(() => resolveWatchlistTarget("nope", { watchlistDir: dir }), /available: release-critical/);
});

test("the shipped example watchlist is valid", () => {
  const doc = JSON.parse(fs.readFileSync("watchlists/release-critical.json", "utf8"));
  const { pages } = validateWatchlist(doc, { origin: "https://docs.chain.link" });
  assert.ok(pages.length >= 1);
});

// ------------------------------------------------------------------ page ---

test("page target validates the URL", async () => {
  // resolveTarget is async, so these reject rather than throw synchronously.
  await assert.rejects(() => resolveTarget("page:not-a-url"), /not a valid URL/);
  await assert.rejects(() => resolveTarget("page:ftp://x/y"), /must be http or https/);
});
