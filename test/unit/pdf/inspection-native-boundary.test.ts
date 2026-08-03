import { afterEach, describe, expect, it, vi } from "vitest";

const nativeBoundary = vi.hoisted(() => ({
  bindingLoadError: new Error("native binding diagnostic retained in cause"),
  classifierError: new Error("classifier diagnostic retained in cause"),
  mode: "return" as "return" | "throw-binding" | "throw-classifier",
}));

vi.mock("node:module", async (importOriginal) => {
  const nodeModule = await importOriginal<typeof import("node:module")>();

  return {
    ...nodeModule,
    createRequire: () => () => {
      if (nativeBoundary.mode === "throw-binding") {
        throw nativeBoundary.bindingLoadError;
      }

      return {
        classifyPdf: () => {
          if (nativeBoundary.mode === "throw-classifier") {
            throw nativeBoundary.classifierError;
          }

          return {
            pdfType: "TextBased",
            pageCount: 1,
            pagesNeedingOcr: [],
            confidence: 1,
          };
        },
        extractTextWithPositions: vi.fn(),
      };
    },
  };
});

afterEach(() => {
  nativeBoundary.mode = "return";
  vi.clearAllMocks();
  vi.resetModules();
});

describe("inspectScreenplayPdf native boundary", () => {
  it("maps binding-load failure to the public unavailable error", async () => {
    nativeBoundary.mode = "throw-binding";
    const { inspectScreenplayPdf, PdfInspectionError } = await loadPublicApi();
    const outcome = captureInspection(() =>
      inspectScreenplayPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    );

    expect(outcome.result).toBe(noResult);
    expect(outcome.error).toBeInstanceOf(PdfInspectionError);
    expect(outcome.error).toMatchObject({
      code: "PDF_BINDING_UNAVAILABLE",
      message: "PDF native binding is unavailable.",
      cause: nativeBoundary.bindingLoadError,
    });
  });

  it("retains the classifier error as cause while sanitizing the public message", async () => {
    nativeBoundary.mode = "throw-classifier";
    const { inspectScreenplayPdf, PdfInspectionError } = await loadPublicApi();
    const outcome = captureInspection(() =>
      inspectScreenplayPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    );

    expect(outcome.result).toBe(noResult);
    expect(outcome.error).toBeInstanceOf(PdfInspectionError);
    expect(outcome.error).toMatchObject({
      code: "PDF_INSPECTION_FAILED",
      message: "PDF inspection failed.",
      cause: nativeBoundary.classifierError,
    });
    expect((outcome.error as Error).message).not.toContain(
      "classifier diagnostic",
    );
  });
});

const noResult = Symbol("no inspection result");

function captureInspection(inspect: () => unknown): {
  result: unknown;
  error: unknown;
} {
  let result: unknown = noResult;
  let error: unknown;

  try {
    result = inspect();
  } catch (thrown) {
    error = thrown;
  }

  return { result, error };
}

async function loadPublicApi() {
  return import("../../../src/index.js");
}
