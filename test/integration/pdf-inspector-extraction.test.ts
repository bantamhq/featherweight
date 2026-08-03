import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PdfExtractionError } from "../../src/pdf/extraction/errors.js";
import { extractPositionedPdfText } from "../../src/pdf/extraction/pdf-inspector.js";

const screenplayPdfUrl = new URL("../brick-and-steel.pdf", import.meta.url);

describe("extractPositionedPdfText", () => {
  it("extracts every screenplay text run in native order across all five pages", () => {
    const result = extractPositionedPdfText(readFileSync(screenplayPdfUrl));
    const items = result.items;
    const actualPageIndices: number[] = [];

    expect(items).toHaveLength(126);

    for (let sourceIndex = 0; sourceIndex < items.length; sourceIndex += 1) {
      expect(items[sourceIndex]!.sourceIndex).toBe(sourceIndex);
      expect(items[sourceIndex]!.sourceMethod).toBe("embedded-text");
      actualPageIndices.push(items[sourceIndex]!.pageIndex);
    }

    expect(actualPageIndices).toEqual([
      ...Array<number>(9).fill(0),
      ...Array<number>(37).fill(1),
      ...Array<number>(41).fill(2),
      ...Array<number>(37).fill(3),
      ...Array<number>(2).fill(4),
    ]);

    expect(items[0]).toMatchObject({
      sourceIndex: 0,
      pageIndex: 0,
      text: "BRICK & STEEL",
    });
    expect(items[9]).toMatchObject({
      sourceIndex: 9,
      pageIndex: 1,
      text: "EXT. BRICK'S PATIO - DAY",
      style: { bold: true },
    });
    expect(items[10]).toMatchObject({
      sourceIndex: 10,
      pageIndex: 1,
      text: "A gorgeous day.  The sun is shining.  But BRICK BRADDOCK,",
    });
    expect(items[15]).toMatchObject({
      sourceIndex: 15,
      pageIndex: 1,
      text: "STEEL",
    });
    expect(items[16]).toMatchObject({
      sourceIndex: 16,
      pageIndex: 1,
      text: "Beer's ready!",
    });
    expect(items[23]).toMatchObject({
      sourceIndex: 23,
      pageIndex: 1,
      text: "(beer raised)",
    });
    expect(items[32]).toMatchObject({ text: "STEEL" });
    expect(items[33]).toMatchObject({ text: "BRICK" });
    expect(items[34]).toMatchObject({ text: "Screw retirement." });
    expect(items[35]).toMatchObject({ text: "Screw retirement." });
    expect(items[36]).toMatchObject({
      sourceIndex: 36,
      pageIndex: 1,
      text: "SMASH CUT TO:",
    });
    expect(items[44]).toMatchObject({
      sourceIndex: 44,
      pageIndex: 1,
      text: "Did you know Brick and Steel are",
      style: { italic: true },
    });
    expect(items[45]).toMatchObject({
      sourceIndex: 45,
      pageIndex: 1,
      text: "retired?",
      style: { italic: true },
    });
    expect(items[46]).toMatchObject({
      sourceIndex: 46,
      pageIndex: 2,
      text: "2.",
    });
    expect(items[49]).toMatchObject({
      sourceIndex: 49,
      pageIndex: 2,
      text: "Permanently",
      style: { underline: true },
    });
    expect(items[50]).toMatchObject({
      sourceIndex: 50,
      pageIndex: 2,
      text: ".",
      style: { underline: false },
    });
    expect(items[64]).toMatchObject({
      sourceIndex: 64,
      text: "Steel's face FILLS",
      style: { italic: false, underline: true },
    });
    expect(items[65]).toMatchObject({
      sourceIndex: 65,
      text: "the ",
      style: { italic: false, underline: true },
    });
    expect(items[66]).toMatchObject({
      sourceIndex: 66,
      text: "Leupold Mark 4",
      style: { italic: true, underline: true },
    });
    expect(items[67]).toMatchObject({
      sourceIndex: 67,
      text: " scope",
      style: { italic: false, underline: true },
    });
    expect(items[68]).toMatchObject({
      sourceIndex: 68,
      text: ".",
      style: { italic: false, underline: false },
    });
    expect(items[76]).toMatchObject({
      sourceIndex: 76,
      pageIndex: 2,
      text: "OPENING TITLES",
      style: { bold: true },
    });
    expect(items[87]).toMatchObject({
      sourceIndex: 87,
      pageIndex: 3,
      text: "3.",
    });
    expect(items[102]).toMatchObject({
      sourceIndex: 102,
      pageIndex: 3,
      text: "INT. GARAGE - DAY",
      style: { bold: true },
    });
    expect(items[123]).toMatchObject({
      sourceIndex: 123,
      pageIndex: 3,
      text: "BURN TO PINK.",
    });
    expect(items[124]).toMatchObject({
      sourceIndex: 124,
      pageIndex: 4,
      text: "4.",
    });
    expect(items[125]).toMatchObject({
      sourceIndex: 125,
      pageIndex: 4,
      text: "THE END",
    });

    for (const item of items) {
      expect(Number.isFinite(item.bounds.x)).toBe(true);
      expect(Number.isFinite(item.bounds.y)).toBe(true);
      expect(Number.isFinite(item.bounds.width)).toBe(true);
      expect(Number.isFinite(item.bounds.height)).toBe(true);
      expect(Number.isFinite(item.font.size)).toBe(true);
      expect(typeof item.font.name).toBe("string");
      expect(typeof item.style.bold).toBe("boolean");
      expect(typeof item.style.italic).toBe("boolean");
      expect(typeof item.style.underline).toBe("boolean");
      expect(typeof item.style.strikeout).toBe("boolean");
    }
  });

  it("accepts Buffer and non-Buffer Uint8Array inputs with identical results", () => {
    const pdfBytes = readFileSync(screenplayPdfUrl);
    const bufferResult = extractPositionedPdfText(Buffer.from(pdfBytes));
    const paddedBytes = new Uint8Array(pdfBytes.byteLength + 6);
    paddedBytes.set(pdfBytes, 3);
    const uint8Array = paddedBytes.subarray(3, 3 + pdfBytes.byteLength);
    const uint8ArrayResult = extractPositionedPdfText(uint8Array);

    expect(Buffer.isBuffer(uint8Array)).toBe(false);
    expect(uint8ArrayResult).toEqual(bufferResult);
  });

  it("is deeply deterministic and returns only plain JSON-compatible data", () => {
    const pdfBytes = readFileSync(screenplayPdfUrl);
    const firstResult = extractPositionedPdfText(pdfBytes);
    const secondResult = extractPositionedPdfText(pdfBytes);

    expect(secondResult).toEqual(firstResult);
    expect(JSON.parse(JSON.stringify(firstResult))).toEqual(firstResult);
    expect(Object.getPrototypeOf(firstResult)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(firstResult.items)).toBe(Array.prototype);

    for (const item of firstResult.items) {
      expect(Object.getPrototypeOf(item)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(item.bounds)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(item.font)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(item.style)).toBe(Object.prototype);
    }
  });

  it("wraps malformed input synchronously without exposing native diagnostics", () => {
    const malformedBytes = new Uint8Array([0x6e, 0x6f, 0x74, 0x2d, 0x70, 0x64, 0x66]);
    let thrown: unknown;

    try {
      extractPositionedPdfText(malformedBytes);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PdfExtractionError);
    expect(thrown).toMatchObject({
      code: "PDF_EXTRACTION_FAILED",
      message: "PDF extraction failed.",
      cause: expect.any(Error),
    });
    expect((thrown as Error).message).not.toContain("not-pdf");
  });
});
