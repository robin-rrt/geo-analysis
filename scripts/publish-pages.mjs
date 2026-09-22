// Publish the dashboard to a GitHub Pages branch.
//
// The site and its data live on an ORPHAN branch holding nothing else. `main`
// keeps its ~10k lines of code and never sees the 5MB of generated JSON that
// would otherwise conflict on every branch that ran anything.
//
// The branch is rebuilt from scratch and force-pushed each time, so it always
// holds exactly one commit. Without that, every publish would add another few
// megabytes to the repository permanently.
//
//   node scripts/publish-pages.mjs            # build the branch locally
//   node scripts/publish-pages.mjs --push     # ...and force-push it
//
// GitHub Pages cannot set HTTP headers, so the X-Robots-Tag that the Vercel
// deploy relies on is unavailable here. robots.txt and the <meta robots> tag
// still ship; see the warning printed at the end.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BRANCH = "gh-pages";
const STAGE = "public-dist";
const PUSH = process.argv.includes("--push");

const git = (args, opts = {}) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();

// Build the artifact first: no point touching git if the site will not assemble.
execFileSync("node", ["scripts/build-public.mjs", STAGE], { stdio: "inherit" });

const remote = git(["remote", "get-url", "origin"]);
const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "geo-pages-"));

// A detached worktree, so the branch is assembled without disturbing whatever
// is checked out — publishing must never touch work in progress.
git(["worktree", "add", "--detach", worktree, "HEAD"]);

try {
  // A throwaway orphan name, never `gh-pages` itself. Checking out the real
  // branch name fails the moment one exists locally — which it will from the
  // previous publish — and the branch is only ever a push target anyway.
  const temp = `publish-${Date.now().toString(36)}`;
  git(["checkout", "--orphan", temp], { cwd: worktree });
  git(["rm", "-rf", "--quiet", "."], { cwd: worktree });

  const copy = (from, to) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const s = path.join(from, e.name);
      const d = path.join(to, e.name);
      if (e.isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        copy(s, d);
      } else fs.copyFileSync(s, d);
    }
  };
  copy(STAGE, worktree);

  // Without this, Pages runs the content through Jekyll, which silently drops
  // any file or directory beginning with an underscore.
  fs.writeFileSync(path.join(worktree, ".nojekyll"), "");

  // A README on the branch, so someone landing on it in the repo UI does not
  // mistake generated output for source.
  fs.writeFileSync(
    path.join(worktree, "README.md"),
    "# Published dashboard\n\n" +
      "Generated output. Do not edit here — this branch is rebuilt and force-pushed by\n" +
      "`scripts/publish-pages.mjs`. Source lives on the default branch.\n",
  );

  git(["add", "-A"], { cwd: worktree });
  const stamp = new Date().toISOString();
  git(["commit", "-q", "-m", `Publish dashboard ${stamp}`], { cwd: worktree });

  const files = git(["ls-files"], { cwd: worktree }).split("\n").filter(Boolean).length;
  console.log(`\n${BRANCH}: ${files} file(s), one commit`);

  if (PUSH) {
    // Force, because the branch is regenerated rather than appended to. This is
    // the mechanism that stops the repository growing by megabytes per publish.
    execFileSync("git", ["push", "--force", remote, `HEAD:${BRANCH}`], { cwd: worktree, stdio: "inherit" });
    const slug = remote.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
    const [owner, repo] = slug.split("/");
    console.log(`\npushed. Enable Pages: Settings > Pages > Source: branch "${BRANCH}", folder /`);
    if (owner && repo) console.log(`then it serves at https://${owner}.github.io/${repo}/`);
  } else {
    console.log(`\nnot pushed. Re-run with --push when ready.`);
  }

  // The temp branch has served its purpose; leaving it accumulates a dead
  // branch per publish.
  git(["checkout", "--detach"], { cwd: worktree });
  try {
    git(["branch", "-D", temp], { cwd: worktree });
  } catch {
    /* already gone */
  }

  console.log(
    "\nBefore sharing the URL, check Settings > Pages > visibility.\n" +
      "  Private (Enterprise Cloud): the site requires sign-in, so indexing is moot.\n" +
      "  Public: anyone with the link can read it — including probe answers and per-run\n" +
      "  costs. Pages cannot set HTTP headers, so X-Robots-Tag is unavailable and only\n" +
      "  robots.txt and <meta robots> apply, and both merely ask.",
  );
} finally {
  // Always detach the worktree, even on failure — a stray one blocks the next run.
  try {
    git(["worktree", "remove", "--force", worktree]);
  } catch {
    fs.rmSync(worktree, { recursive: true, force: true });
  }
}
