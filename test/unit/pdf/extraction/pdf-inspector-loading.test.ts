import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfExtractionError } from "../../../../src/pdf/extraction/errors.js";

const nativeBoundary = vi.hoisted(() => ({
  bindingLoadError: new Error("native binding diagnostic that must not escape"),
  mode: "throw" as "extract-only" | "throw",
}));

vi.mock("node:module", async (importOriginal) => {
  const nodeModule = await importOriginal<typeof import("node:module")>();

  return {
    ...nodeModule,
    createRequire: () => () => {
      if (nativeBoundary.mode === "throw") {
        throw nativeBoundary.bindingLoadError;
      }

      return {
        extractTextWithPositions: () => [],
      };
    },
  };
});

afterEach(() => {
  nativeBoundary.mode = "throw";
  vi.resetModules();
});

describe("extractPositionedPdfText native loading", () => {
  it("maps a synchronous native binding load failure to the owned error", async () => {
    const { extractPositionedPdfText } = await import(
      "../../../../src/pdf/extraction/pdf-inspector.js"
    );
    let thrown: unknown;

    try {
      extractPositionedPdfText(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PdfExtractionError);
    expect(thrown).toMatchObject({
      code: "PDF_BINDING_UNAVAILABLE",
      message: "PDF native binding is unavailable.",
      cause: nativeBoundary.bindingLoadError,
    });
  });

  it("loads extraction when only its required binding method is available", async () => {
    nativeBoundary.mode = "extract-only";
    const { extractPositionedPdfText } = await import(
      "../../../../src/pdf/extraction/pdf-inspector.js"
    );

    const result = extractPositionedPdfText(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    );

    expect(result).toEqual({ items: [] });
  });
});
