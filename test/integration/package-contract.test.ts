import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("declares the supported package and contributor toolchain", async () => {
  const packageJson = await readFile(
    new URL("../../package.json", import.meta.url),
    "utf8",
  );
  const packageManifest = JSON.parse(packageJson) as {
    name?: unknown;
    type?: unknown;
    engines?: unknown;
    packageManager?: unknown;
  };

  expect({
    name: packageManifest.name,
    type: packageManifest.type,
    engines: packageManifest.engines,
    packageManager: packageManifest.packageManager,
  }).toEqual({
    name: "@bantam-hq/featherweight",
    type: "module",
    engines: { node: ">=24" },
    packageManager: "pnpm@11.18.0",
  });
});
