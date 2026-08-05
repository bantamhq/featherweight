#!/usr/bin/env node

import { readFileSync } from "node:fs";
import type { Writable } from "node:stream";

import { runCli } from "./cli/run-cli.js";

const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  version: packageManifest.version,
  writeStdout: (value) => writeToStream(process.stdout, value),
  writeStderr: (value) => writeToStream(process.stderr, value),
});

function writeToStream(stream: Writable, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(value, "utf8", (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
