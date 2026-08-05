import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  inspectScreenplayPdf,
  PdfInspectionError,
} from "../../src/index.js";
import type {
  PdfInspection,
  PdfInspectionErrorCode,
  PositionedTextBounds,
  PositionedTextFont,
  PositionedTextPage,
  PositionedTextPageItem,
  PositionedTextStyle,
  ScreenplayConversionErrorCode,
} from "../../src/index.js";
import * as featherweight from "../../src/index.js";

type PublicTypeSurface = readonly [
  PdfInspection,
  PdfInspectionErrorCode,
  ScreenplayConversionErrorCode,
  PositionedTextPage,
  PositionedTextPageItem,
  PositionedTextBounds,
  PositionedTextFont,
  PositionedTextStyle,
];

const fixtureCases = [
  ["native", "brick-and-steel.pdf", []],
  ["scanned", "brick-and-steel-scanned.pdf", [0, 1, 2, 3, 4]],
  ["mixed", "brick-and-steel-mixed.pdf", [1, 3]],
] as const;

describe("inspectScreenplayPdf", () => {
  it.each(fixtureCases)(
    "returns the exact OCR recommendation for the %s fixture",
    (_fixtureKind, fixtureName, pagesNeedingOcr) => {
      const result = inspectScreenplayPdf(readFixture(fixtureName));

      expect(result).toEqual({
        pageCount: 5,
        pagesNeedingOcr: [...pagesNeedingOcr],
      });
    },
  );

  it("inspects only an offset view without mutating its backing bytes", () => {
    const fixtureBytes = readFixture("brick-and-steel-mixed.pdf");
    const paddedBytes = new Uint8Array(fixtureBytes.byteLength + 8);
    paddedBytes.fill(0xa5);
    paddedBytes.set(fixtureBytes, 4);
    const offsetView = paddedBytes.subarray(4, 4 + fixtureBytes.byteLength);
    const originalPaddedBytes = Uint8Array.from(paddedBytes);

    const result = inspectScreenplayPdf(offsetView);

    expect(result).toEqual({ pageCount: 5, pagesNeedingOcr: [1, 3] });
    expect(Buffer.compare(paddedBytes, originalPaddedBytes)).toBe(0);
  });

  it("wraps malformed bytes synchronously with a sanitized public error", () => {
    const malformedBytes = new Uint8Array([
      0x6e, 0x6f, 0x74, 0x2d, 0x70, 0x64, 0x66,
    ]);
    let thrown: unknown;

    try {
      inspectScreenplayPdf(malformedBytes);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PdfInspectionError);
    expect(thrown).toMatchObject({
      code: "PDF_INSPECTION_FAILED",
      message: "PDF inspection failed.",
      cause: expect.any(Error),
    });
    expect((thrown as Error).message).not.toContain("not-pdf");
  });

  it("exports only the approved runtime surface from the root", () => {
    expect(Object.keys(featherweight).sort()).toEqual([
      "PdfInspectionError",
      "ScreenplayConversionError",
      "inspectScreenplayPdf",
      "screenplayToFDX",
      "screenplayToFountain",
      "screenplayToJSON",
    ]);
  });
});

function readFixture(fixtureName: string): Buffer {
  return readFileSync(new URL(`../${fixtureName}`, import.meta.url));
}
