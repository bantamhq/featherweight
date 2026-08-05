import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  screenplayToFountain,
  screenplayToJSON,
} from "../../src/index.js";
import { extractPositionedPdfText } from "../../src/pdf/extraction/pdf-inspector.js";
import { positionedTextToPages } from "../fixtures/positioned-text-pages.js";
import { brickAndSteelDocument } from "../fixtures/semantic/brick-and-steel-document.js";
import { normalizationGauntletDocument } from "../fixtures/semantic/normalization-gauntlet-document.js";

describe("screenplay conversion public API", () => {
  it("converts native Brick & Steel pages to its complete canonical outputs deterministically", () => {
    const nativePages = extractPages("brick-and-steel.pdf");
    const expectedJSON = JSON.stringify(brickAndSteelDocument, null, 2) + "\n";
    const expectedFountain = readGolden("brick-and-steel.expected.fountain");

    expect([
      screenplayToJSON(nativePages, []),
      screenplayToJSON(nativePages, []),
    ]).toEqual([expectedJSON, expectedJSON]);
    expect([
      screenplayToFountain(nativePages, []),
      screenplayToFountain(nativePages, []),
    ]).toEqual([expectedFountain, expectedFountain]);
  });

  it("combines caller-routed native and OCR Brick & Steel pages without order dependence or mutation", () => {
    const completeNativePages = extractPages("brick-and-steel.pdf");
    const mixedNativePages = extractPages("brick-and-steel-mixed.pdf").filter(
      (page) => [0, 2, 4].includes(page.pageIndex),
    );
    const ocrPages = completeNativePages.filter((page) =>
      [1, 3].includes(page.pageIndex)
    );
    const originalNativePages = structuredClone(mixedNativePages);
    const originalOcrPages = structuredClone(ocrPages);
    const expectedJSON = JSON.stringify(brickAndSteelDocument, null, 2) + "\n";
    const expectedFountain = readGolden("brick-and-steel.expected.fountain");

    expect(screenplayToJSON(mixedNativePages, ocrPages)).toBe(expectedJSON);
    expect(screenplayToFountain(mixedNativePages, ocrPages)).toBe(
      expectedFountain,
    );
    expect(
      screenplayToJSON(
        [...mixedNativePages].reverse(),
        [...ocrPages].reverse(),
      ),
    ).toBe(expectedJSON);
    expect(
      screenplayToFountain(
        [...mixedNativePages].reverse(),
        [...ocrPages].reverse(),
      ),
    ).toBe(expectedFountain);
    expect(mixedNativePages).toEqual(originalNativePages);
    expect(ocrPages).toEqual(originalOcrPages);
  });

  it("converts native Normalization Gauntlet pages to its complete canonical outputs", () => {
    const nativePages = extractPages("normalization-gauntlet-clean.pdf");

    expect(screenplayToJSON(nativePages, [])).toBe(
      JSON.stringify(normalizationGauntletDocument, null, 2) + "\n",
    );
    expect(screenplayToFountain(nativePages, [])).toBe(
      readGolden("normalization-gauntlet.expected.fountain"),
    );
  });
});

function extractPages(fixtureName: string) {
  return positionedTextToPages(
    extractPositionedPdfText(
      readFileSync(new URL(`../${fixtureName}`, import.meta.url)),
    ),
  );
}

function readGolden(fixtureName: string): string {
  return readFileSync(
    new URL(`../fixtures/fountain/${fixtureName}`, import.meta.url),
    "utf8",
  );
}
