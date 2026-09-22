// Repo-local .env loading, in one place.
//
// This used to live at the top of cli.js, so anything that was not the CLI —
// a script, a test harness — started unauthenticated and failed at the first
// API call with "Could not resolve authentication method". Importing this
// module is the whole contract; env vars already set always win.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const envFileLoaded = fs.existsSync(envFile);
