import fs from "node:fs";
import { spawn } from "node:child_process";

const pathsToClean = [
  ".netlify/functions-internal",
  ".netlify/functions-serve",
];

for (const p of pathsToClean) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const args = process.argv.slice(2);
const netlifyArgs = [
  "netlify",
  "dev",
  "--port",
  "8888",
  "--dir",
  ".",
  "--functions",
  "netlify/functions",
  "--offline",
  ...args,
];

const child = spawn("npx", netlifyArgs, {
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
