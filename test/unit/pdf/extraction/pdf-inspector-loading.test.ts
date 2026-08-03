import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfExtractionError } from "../../../../src/pdf/extraction/errors.js";

const bindingLoadError = vi.hoisted(
  () => new Error("native binding diagnostic that must not escape"),
);

vi.mock("node:module", async (importOriginal) => {
  const nodeModule = await importOriginal<typeof import("node:module")>();

  return {
    ...nodeModule,
    createRequire: () => () => {
      throw bindingLoadError;
    },
  };
});

afterEach(() => {
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
      cause: bindingLoadError,
    });
  });
});
