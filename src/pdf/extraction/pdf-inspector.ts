import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

import type {
  PositionedText,
  PositionedTextItem,
} from "../../core/positioned-text.js";
import { PdfInspectionError } from "../inspection-error.js";
import { PdfExtractionError } from "./errors.js";

export interface PdfInspectorTextItemInput {
  readonly itemType: string;
  readonly text?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly font?: string;
  readonly fontSize?: number;
  readonly page?: number;
  readonly isBold?: boolean;
  readonly isItalic?: boolean;
  readonly isUnderline?: boolean;
  readonly isStrikeout?: boolean;
}

interface PdfInspectorExtractionModule {
  extractTextWithPositions(
    buffer: Buffer,
    pages?: readonly number[],
  ): readonly PdfInspectorTextItemInput[];
}

interface PdfInspectorInspectionModule {
  classifyPdf(buffer: Buffer): PdfInspectorClassification;
}

interface PdfInspectorClassification {
  readonly pageCount: number;
  readonly pagesNeedingOcr: readonly number[];
}

type PdfInspectorOperation = "extraction" | "inspection";

export function extractPositionedPdfText(
  pdfBytes: Uint8Array,
  pageIndexes?: readonly number[],
): PositionedText {
  const pdfInspector = loadPdfInspector("extraction");
  let nativeItems: readonly PdfInspectorTextItemInput[];

  try {
    nativeItems = pdfInspector.extractTextWithPositions(
      toPdfBuffer(pdfBytes),
      pageIndexes?.map((pageIndex) => pageIndex + 1),
    );
  } catch (cause) {
    if (cause instanceof PdfExtractionError) {
      throw cause;
    }

    throw new PdfExtractionError("PDF_EXTRACTION_FAILED", cause);
  }

  return translatePdfInspectorTextItems(nativeItems);
}

export function classifyPdfForOcr(
  pdfBytes: Uint8Array,
): PdfInspectorClassification {
  const pdfInspector = loadPdfInspector("inspection");

  try {
    const classification = pdfInspector.classifyPdf(toPdfBuffer(pdfBytes));

    return {
      pageCount: classification.pageCount,
      pagesNeedingOcr: classification.pagesNeedingOcr,
    };
  } catch (cause) {
    if (cause instanceof PdfInspectionError) {
      throw cause;
    }

    throw new PdfInspectionError("PDF_INSPECTION_FAILED", cause);
  }
}

export function translatePdfInspectorTextItems(
  items: readonly PdfInspectorTextItemInput[],
): PositionedText {
  const translatedItems: PositionedTextItem[] = [];

  try {
    for (let sourceIndex = 0; sourceIndex < items.length; sourceIndex += 1) {
      const item = items[sourceIndex]!;

      if (item.itemType !== "Text") {
        continue;
      }

      assertValidTextItem(item);
      translatedItems.push({
        sourceIndex,
        sourceMethod: "embedded-text",
        pageIndex: item.page - 1,
        text: item.text,
        bounds: {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        },
        font: {
          name: item.font,
          size: item.fontSize,
        },
        style: {
          bold: item.isBold,
          italic: item.isItalic,
          underline: item.isUnderline,
          strikeout: item.isStrikeout,
        },
      });
    }
  } catch (cause) {
    if (cause instanceof PdfExtractionError) {
      throw cause;
    }

    throw new PdfExtractionError("PDF_ITEM_TRANSLATION_FAILED", cause);
  }

  return { items: translatedItems };
}

function loadPdfInspector(
  operation: "extraction",
): PdfInspectorExtractionModule;
function loadPdfInspector(
  operation: "inspection",
): PdfInspectorInspectionModule;
function loadPdfInspector(
  operation: PdfInspectorOperation,
): PdfInspectorExtractionModule | PdfInspectorInspectionModule {
  try {
    const require = createRequire(import.meta.url);
    const pdfInspector: unknown = require("@firecrawl/pdf-inspector");

    if (operation === "extraction") {
      if (!isPdfInspectorExtractionModule(pdfInspector)) {
        throw new Error("PDF inspector binding has an invalid interface.");
      }

      return pdfInspector;
    }

    if (!isPdfInspectorInspectionModule(pdfInspector)) {
      throw new Error("PDF inspector binding has an invalid interface.");
    }

    return pdfInspector;
  } catch (cause) {
    if (operation === "inspection") {
      throw new PdfInspectionError("PDF_BINDING_UNAVAILABLE", cause);
    }

    throw new PdfExtractionError("PDF_BINDING_UNAVAILABLE", cause);
  }
}

function isPdfInspectorExtractionModule(
  value: unknown,
): value is PdfInspectorExtractionModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "extractTextWithPositions" in value &&
    typeof value.extractTextWithPositions === "function"
  );
}

function isPdfInspectorInspectionModule(
  value: unknown,
): value is PdfInspectorInspectionModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "classifyPdf" in value &&
    typeof value.classifyPdf === "function"
  );
}

function toPdfBuffer(pdfBytes: Uint8Array): Buffer {
  return Buffer.from(
    pdfBytes.buffer,
    pdfBytes.byteOffset,
    pdfBytes.byteLength,
  );
}

function assertValidTextItem(
  item: PdfInspectorTextItemInput,
): asserts item is Required<PdfInspectorTextItemInput> {
  if (
    typeof item.page !== "number" ||
    !Number.isInteger(item.page) ||
    item.page < 1
  ) {
    throw new Error("Native PDF text item has an invalid page.");
  }

  assertFiniteNumber(item.x);
  assertFiniteNumber(item.y);
  assertFiniteNumber(item.width);
  assertFiniteNumber(item.height);
  assertFiniteNumber(item.fontSize);

  if (typeof item.text !== "string" || typeof item.font !== "string") {
    throw new Error("Native PDF text item has invalid text metadata.");
  }

  if (
    typeof item.isBold !== "boolean" ||
    typeof item.isItalic !== "boolean" ||
    typeof item.isUnderline !== "boolean" ||
    typeof item.isStrikeout !== "boolean"
  ) {
    throw new Error("Native PDF text item has invalid style metadata.");
  }
}

function assertFiniteNumber(value: number | undefined): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Native PDF text item has invalid numeric metadata.");
  }
}
