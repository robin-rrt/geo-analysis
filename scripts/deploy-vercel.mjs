// Deploy the dashboard without putting its data in git.
//
// Vercel's Build Output API: whatever sits in .vercel/output is uploaded as-is
// by `vercel deploy --prebuilt`, with no build run on their side. The data
// therefore never needs to be committed — it is assembled here, on the machine
// that has results/, and uploaded directly.
//
// The trade: no deploy-on-push and no per-PR preview URLs. For a dashboard that
// changes when you run an audit rather than when you edit code, that is the
// right way round — a push that only touches the CLI should not redeploy a
// dashboard, and a new audit should.
//
//   node scripts/deploy-vercel.mjs          # build .vercel/output only
//   node scripts/deploy-vercel.mjs --deploy # ...and deploy to production
//
// Requires: npm i -g vercel (or npx), and `vercel link` once in this directory.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const OUT = ".vercel/output";
const STAGE = "public-dist";
const DEPLOY = process.argv.includes("--deploy");

// Assemble the site exactly as the committed-data path would, so the two
// deployment routes cannot drift into producing different artifacts.
execFileSync("node", ["scripts/build-public.mjs", STAGE], { stdio: "inherit" });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "static"), { recursive: true });

let files = 0;
const copy = (from, to) => {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copy(s, d);
    } else {
      fs.copyFileSync(s, d);
      files++;
    }
  }
};
copy(STAGE, path.join(OUT, "static"));

// Headers live here rather than in vercel.json: with --prebuilt there is no
// remote build, so vercel.json's build settings are not consulted. Losing the
// noindex header on the deploy path that skips the build would be a quiet and
// expensive mistake.
fs.writeFileSync(
  path.join(OUT, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/(.*)",
          headers: {
            "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
            "Referrer-Policy": "no-referrer",
          },
          continue: true,
        },
        { handle: "filesystem" },
        // Hash routing means the SPA never needs a rewrite, but a stray path
        // should land on the app rather than a 404 page.
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ) + "\n",
);

console.log(`\n${OUT}/ ready — ${files} file(s), headers included`);

if (!DEPLOY) {
  console.log("\nnext:");
  console.log("  npx vercel link          # once, to bind this directory to a project");
  console.log("  node scripts/deploy-vercel.mjs --deploy");
  process.exit(0);
}

console.log("\ndeploying...");
execFileSync("npx", ["vercel", "deploy", "--prebuilt", "--prod"], { stdio: "inherit" });
