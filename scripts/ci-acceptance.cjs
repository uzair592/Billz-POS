const { spawnSync } = require("node:child_process");
const result = spawnSync(process.execPath, ["scripts/provision-runtime.cjs"], {
  env: process.env,
  encoding: "utf8",
});
if (result.status !== 0) throw new Error("Credential provisioning failed.");
const credentials = JSON.parse(result.stdout);
const acceptance = spawnSync(process.execPath, ["scripts/test-phase-1.cjs"], {
  env: {
    ...process.env,
    RUNTIME_DATABASE_URL: credentials.runtimeUrl,
    PLATFORM_DATABASE_URL: credentials.platformUrl,
  },
  stdio: "inherit",
});
process.exitCode = acceptance.status ?? 1;
