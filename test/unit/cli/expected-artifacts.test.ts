import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { brickAndSteelDocument } from "../../fixtures/semantic/brick-and-steel-document.js";

describe("CLI expected artifacts", () => {
  it("keeps the static Brick & Steel JSON fixture equal to the reviewed semantic authority", async () => {
    const fixtureText = await readFile(
      new URL(
        "../../fixtures/cli/brick-and-steel.expected.json",
        import.meta.url,
      ),
      "utf8",
    );
    const canonicalFixture =
      JSON.stringify(JSON.parse(fixtureText), null, 2) + "\n";
    const canonicalAuthority =
      JSON.stringify(brickAndSteelDocument, null, 2) + "\n";

    expect(canonicalFixture).toBe(canonicalAuthority);
  });
});
