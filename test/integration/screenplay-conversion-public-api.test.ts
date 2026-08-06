import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ScreenplayConversionError,
  screenplayToFDX,
  screenplayToFountain,
  screenplayToJSON,
} from "../../src/index.js";
import { brickAndSteelDocument } from "../fixtures/semantic/brick-and-steel-document.js";
import { normalizationGauntletDocument } from "../fixtures/semantic/normalization-gauntlet-document.js";
import {
  elementChildren,
  firstElement,
  parseFdxDocument,
  projectFdxDocument,
} from "../support/fdx-document.js";

describe("screenplay conversion public API", () => {
  it("converts a PDF through native page routes to complete canonical outputs without mutation", () => {
    const pdfBytes = readPdf("brick-and-steel.pdf");
    const originalPdfBytes = Uint8Array.from(pdfBytes);
    const nativePageIndexes = Object.freeze([4, 2, 0, 3, 1]);
    const ocrPageIndexes = Object.freeze([] as number[]);
    const expectedJSON = JSON.stringify(brickAndSteelDocument, null, 2) + "\n";
    const expectedFountain = readGolden("brick-and-steel.expected.fountain");
    const expectedFDX = projectFdxDocument(
      parseFdxDocument(readFdxGolden("brick-and-steel.expected.fdx")),
    );

    expect([
      screenplayToJSON(pdfBytes, nativePageIndexes, ocrPageIndexes),
      screenplayToJSON(pdfBytes, nativePageIndexes, ocrPageIndexes),
    ]).toEqual([expectedJSON, expectedJSON]);
    expect([
      screenplayToFountain(pdfBytes, nativePageIndexes, ocrPageIndexes),
      screenplayToFountain(pdfBytes, nativePageIndexes, ocrPageIndexes),
    ]).toEqual([expectedFountain, expectedFountain]);
    expect(
      projectFdxDocument(
        parseFdxDocument(
          screenplayToFDX(pdfBytes, nativePageIndexes, ocrPageIndexes),
        ),
      ),
    ).toEqual(expectedFDX);
    expect(Buffer.compare(pdfBytes, originalPdfBytes)).toBe(0);
    expect(nativePageIndexes).toEqual([4, 2, 0, 3, 1]);
    expect(ocrPageIndexes).toEqual([]);
  });

  it("routes OCR page indexes as empty physical boundaries until OCR is available", () => {
    const pdfBytes = readPdf("brick-and-steel.pdf");
    const first = screenplayToJSON(pdfBytes, [4, 2, 0], [3, 1]);
    const second = screenplayToJSON(pdfBytes, [0, 2, 4], [1, 3]);

    expect(first).toBe(second);
    expect(first).toContain("BRICK & STEEL");
    expect(first).toContain("Then let's retire them.");
    expect(first).toContain("I want them dead.  DEAD!");
    expect(first).not.toContain("EXT. BRICK'S PATIO - DAY");
    expect(first).not.toContain("Woah woah woah, Brick and Steel!");
    expect(first).not.toContain("An EXTREMELY HANDSOME MAN drinks a beer.");
  });

  it("converts the Normalization Gauntlet PDF through the same orchestration boundary", () => {
    const pdfBytes = readPdf("normalization-gauntlet-clean.pdf");
    const nativePageIndexes = [0, 1, 2, 3, 4, 5, 6];

    expect(screenplayToJSON(pdfBytes, nativePageIndexes, [])).toBe(
      JSON.stringify(normalizationGauntletDocument, null, 2) + "\n",
    );
    expect(screenplayToFountain(pdfBytes, nativePageIndexes, [])).toBe(
      readGolden("normalization-gauntlet.expected.fountain"),
    );
  });

  it("returns empty artifacts when every PDF page is routed to unavailable OCR", () => {
    const pdfBytes = readPdf("brick-and-steel.pdf");

    expect(screenplayToJSON(pdfBytes, [], [0, 1, 2, 3, 4])).toBe(
      "{\n  \"titlePage\": [],\n  \"elements\": []\n}\n",
    );
    expect(screenplayToFountain(pdfBytes, [], [0, 1, 2, 3, 4])).toBe("");

    const root = parseFdxDocument(
      screenplayToFDX(pdfBytes, [], [0, 1, 2, 3, 4]),
    );

    expect(elementChildren(firstElement(root, "Content"), "Paragraph")).toEqual([]);
    expect(elementChildren(root, "TitlePage")).toEqual([]);
  });

  it("rejects invalid, duplicate, overlapping, and out-of-range page routes", () => {
    const pdfBytes = readPdf("brick-and-steel.pdf");
    const cases = [
      {
        nativePageIndexes: [null] as unknown as readonly number[],
        ocrPageIndexes: [],
        code: "INVALID_PAGE_INDEX",
        message: "Page routing contains an invalid page index.",
      },
      {
        nativePageIndexes: [0, 0],
        ocrPageIndexes: [],
        code: "DUPLICATE_PAGE_INDEX",
        message: "Page routing contains a duplicate page index.",
      },
      {
        nativePageIndexes: [0],
        ocrPageIndexes: [0],
        code: "OVERLAPPING_PAGE_INDEX",
        message: "Native and OCR page routes overlap.",
      },
      {
        nativePageIndexes: [5],
        ocrPageIndexes: [],
        code: "INVALID_PAGE_INDEX",
        message: "Page routing contains an invalid page index.",
      },
    ] as const;

    for (const testCase of cases) {
      const error = captureError(() =>
        screenplayToFDX(
          pdfBytes,
          testCase.nativePageIndexes,
          testCase.ocrPageIndexes,
        )
      );

      expect(error).toBeInstanceOf(ScreenplayConversionError);
      expect(error).toMatchObject({
        code: testCase.code,
        message: testCase.message,
      });
    }
  });

  it("reports PDF processing failures through the conversion boundary", () => {
    const error = captureError(() =>
      screenplayToFountain(new Uint8Array([1, 2, 3]), [], [])
    );

    expect(error).toBeInstanceOf(ScreenplayConversionError);
    expect(error).toMatchObject({
      code: "PDF_PROCESSING_FAILED",
      message: "PDF could not be converted.",
    });
  });
});

function readPdf(fixtureName: string): Buffer {
  return readFileSync(new URL(`../${fixtureName}`, import.meta.url));
}

function readGolden(fixtureName: string): string {
  return readFileSync(
    new URL(`../fixtures/fountain/${fixtureName}`, import.meta.url),
    "utf8",
  );
}

function readFdxGolden(fixtureName: string): string {
  return readFileSync(
    new URL(`../fixtures/fdx/${fixtureName}`, import.meta.url),
    "utf8",
  );
}

function captureError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }

  throw new Error("Expected conversion to throw.");
}
