import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

import { PdfExtractionError } from "./errors.js";
import type {
  PositionedPdfText,
  PositionedPdfTextItem,
} from "./positioned-text.js";

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

interface PdfInspectorModule {
  extractTextWithPositions(buffer: Buffer): readonly PdfInspectorTextItemInput[];
}

export function extractPositionedPdfText(
  pdfBytes: Uint8Array,
): PositionedPdfText {
  const pdfInspector = loadPdfInspector();
  let nativeItems: readonly PdfInspectorTextItemInput[];

  try {
    const buffer = Buffer.from(
      pdfBytes.buffer,
      pdfBytes.byteOffset,
      pdfBytes.byteLength,
    );
    nativeItems = pdfInspector.extractTextWithPositions(buffer);
  } catch (cause) {
    if (cause instanceof PdfExtractionError) {
      throw cause;
    }

    throw new PdfExtractionError("PDF_EXTRACTION_FAILED", cause);
  }

  return translatePdfInspectorTextItems(nativeItems);
}

export function translatePdfInspectorTextItems(
  items: readonly PdfInspectorTextItemInput[],
): PositionedPdfText {
  const translatedItems: PositionedPdfTextItem[] = [];

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

function loadPdfInspector(): PdfInspectorModule {
  try {
    const require = createRequire(import.meta.url);
    const pdfInspector: unknown = require("@firecrawl/pdf-inspector");

    if (!isPdfInspectorModule(pdfInspector)) {
      throw new Error("PDF inspector binding has an invalid interface.");
    }

    return pdfInspector;
  } catch (cause) {
    throw new PdfExtractionError("PDF_BINDING_UNAVAILABLE", cause);
  }
}

function isPdfInspectorModule(value: unknown): value is PdfInspectorModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "extractTextWithPositions" in value &&
    typeof value.extractTextWithPositions === "function"
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
