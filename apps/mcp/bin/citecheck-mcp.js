#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve("tsx/cli");
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverEntryPath = path.resolve(currentDirectory, "../src/mcp.ts");

const child = spawn(process.execPath, [tsxCliPath, serverEntryPath, ...process.argv.slice(2)], {
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
