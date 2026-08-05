import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ScreenplayConversionError,
  screenplayToFDX,
  screenplayToFountain,
  screenplayToJSON,
} from "../../src/index.js";
import type { PositionedTextPage } from "../../src/index.js";
import { extractPositionedPdfText } from "../../src/pdf/extraction/pdf-inspector.js";
import { positionedTextToPages } from "../fixtures/positioned-text-pages.js";
import { brickAndSteelDocument } from "../fixtures/semantic/brick-and-steel-document.js";
import { normalizationGauntletDocument } from "../fixtures/semantic/normalization-gauntlet-document.js";
import {
  elementChildren,
  firstElement,
  parseFdxDocument,
  projectFdxDocument,
} from "../support/fdx-document.js";

describe("screenplay conversion public API", () => {
  it("converts native Brick & Steel pages to its complete canonical outputs deterministically", () => {
    const nativePages = extractPages("brick-and-steel.pdf");
    const expectedJSON = JSON.stringify(brickAndSteelDocument, null, 2) + "\n";
    const expectedFountain = readGolden("brick-and-steel.expected.fountain");
    const expectedFDX = projectFdxDocument(
      parseFdxDocument(readFdxGolden("brick-and-steel.expected.fdx")),
    );

    expect([
      screenplayToJSON(nativePages, []),
      screenplayToJSON(nativePages, []),
    ]).toEqual([expectedJSON, expectedJSON]);
    expect([
      screenplayToFountain(nativePages, []),
      screenplayToFountain(nativePages, []),
    ]).toEqual([expectedFountain, expectedFountain]);
    expect(
      projectFdxDocument(parseFdxDocument(screenplayToFDX(nativePages, []))),
    ).toEqual(expectedFDX);
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
    const expectedFDX = projectFdxDocument(
      parseFdxDocument(readFdxGolden("brick-and-steel.expected.fdx")),
    );

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
    expect(
      projectFdxDocument(
        parseFdxDocument(screenplayToFDX(mixedNativePages, ocrPages)),
      ),
    ).toEqual(expectedFDX);
    expect(
      projectFdxDocument(
        parseFdxDocument(
          screenplayToFDX(
            [...mixedNativePages].reverse(),
            [...ocrPages].reverse(),
          ),
        ),
      ),
    ).toEqual(expectedFDX);
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

  it("returns an empty FDX document for empty caller routing", () => {
    const root = parseFdxDocument(screenplayToFDX([], []));

    expect(root).toMatchObject({
      name: "FinalDraft",
      attributes: {
        DocumentType: "Script",
        Template: "No",
        Version: "1",
      },
    });
    expect(elementChildren(firstElement(root, "Content"), "Paragraph")).toEqual([]);
    expect(elementChildren(root, "TitlePage")).toEqual([]);
  });

  it("routes invalid, duplicate, and overlapping pages through the established public errors", () => {
    const validPage = positionedPage(7, "Visible text.");
    const cases = [
      {
        nativePages: [null] as unknown as readonly PositionedTextPage[],
        ocrPages: [],
        code: "INVALID_POSITIONED_TEXT_PAGE",
        message: "Positioned text page input is invalid.",
      },
      {
        nativePages: [validPage, validPage],
        ocrPages: [],
        code: "DUPLICATE_POSITIONED_TEXT_PAGE",
        message: "Positioned text page input contains a duplicate page index.",
      },
      {
        nativePages: [validPage],
        ocrPages: [validPage],
        code: "OVERLAPPING_POSITIONED_TEXT_PAGE",
        message: "Native and OCR page inputs overlap.",
      },
    ] as const;

    for (const testCase of cases) {
      const error = captureError(() =>
        screenplayToFDX(testCase.nativePages, testCase.ocrPages)
      );

      expect(error).toBeInstanceOf(ScreenplayConversionError);
      expect(error).toMatchObject({
        code: testCase.code,
        message: testCase.message,
      });
    }
  });

  it("rejects recognized XML-invalid text through the public FDX error contract", () => {
    const error = captureError(() =>
      screenplayToFDX([positionedPage(0, "before\u0001after")], [])
    );

    expect(error).toBeInstanceOf(ScreenplayConversionError);
    expect(error).toMatchObject({ code: "INVALID_FDX_TEXT" });
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

function readFdxGolden(fixtureName: string): string {
  return readFileSync(
    new URL(`../fixtures/fdx/${fixtureName}`, import.meta.url),
    "utf8",
  );
}

function positionedPage(pageIndex: number, text: string): PositionedTextPage {
  return {
    pageIndex,
    items: [
      {
        text,
        bounds: { x: 108, y: 700, width: text.length * 7.2, height: 12 },
        font: { name: "Courier Prime", size: 12 },
        style: {
          bold: false,
          italic: false,
          underline: false,
          strikeout: false,
        },
      },
    ],
  };
}

function captureError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }

  throw new Error("Expected conversion to throw.");
}
