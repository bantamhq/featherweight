import { inferScreenplayLayout } from "../core/layout/infer-screenplay-layout.js";
import { groupPositionedTextIntoPhysicalLines } from "../core/physical-lines.js";
import type {
  PositionedText,
  PositionedTextItem,
  SourceMethod,
} from "../core/positioned-text.js";
import { recognizeScreenplay } from "../core/recognition/recognize-screenplay.js";
import type { ScreenplayDocument } from "../core/screenplay-document.js";
import { screenplayDocumentToFountain } from "../fountain/screenplay-document-to-fountain.js";
import { normalizePhysicalText } from "../pdf/normalization/physical-text.js";
import { ScreenplayConversionError } from "./screenplay-conversion-error.js";
import type {
  PositionedTextPage,
  PositionedTextPageItem,
} from "./positioned-text-page.js";

interface ValidatedPage {
  readonly pageIndex: number;
  readonly items: readonly PositionedTextPageItem[];
  readonly sourceMethod: SourceMethod;
}

interface AssembledPositionedText {
  readonly positionedText: PositionedText;
  readonly representedPageIndexes: readonly number[];
}

export function screenplayToJSON(
  nativePages: readonly PositionedTextPage[],
  ocrPages: readonly PositionedTextPage[],
): string {
  const document = createScreenplayDocument(nativePages, ocrPages);

  return `${JSON.stringify(document, null, 2)}\n`;
}

export function screenplayToFountain(
  nativePages: readonly PositionedTextPage[],
  ocrPages: readonly PositionedTextPage[],
): string {
  const document = createScreenplayDocument(nativePages, ocrPages);

  return screenplayDocumentToFountain(document);
}

function createScreenplayDocument(
  nativePages: readonly PositionedTextPage[],
  ocrPages: readonly PositionedTextPage[],
): ScreenplayDocument {
  const assembledText = validateAndAssemblePositionedText(
    nativePages,
    ocrPages,
  );
  const physicalText = groupPositionedTextIntoPhysicalLines(
    assembledText.positionedText,
  );
  const normalizedText = normalizePhysicalText(
    physicalText,
    assembledText.representedPageIndexes,
  );
  const layout = inferScreenplayLayout(normalizedText);

  return recognizeScreenplay(normalizedText, layout);
}

function validateAndAssemblePositionedText(
  nativePages: unknown,
  ocrPages: unknown,
): AssembledPositionedText {
  const validatedNativePages = validatePages(nativePages, "embedded-text");
  const validatedOcrPages = validatePages(ocrPages, "ocr");

  assertUniquePageIndexes(validatedNativePages);
  assertUniquePageIndexes(validatedOcrPages);
  assertDisjointPageIndexes(validatedNativePages, validatedOcrPages);

  const pages = [...validatedNativePages, ...validatedOcrPages].sort(
    (left, right) => left.pageIndex - right.pageIndex,
  );
  let sourceIndex = 0;
  const positionedItems: PositionedTextItem[] = [];

  for (const page of pages) {
    for (const item of page.items) {
      positionedItems.push({
        sourceIndex,
        sourceMethod: page.sourceMethod,
        pageIndex: page.pageIndex,
        text: item.text,
        bounds: { ...item.bounds },
        font: { ...item.font },
        style: { ...item.style },
      });
      sourceIndex += 1;
    }
  }

  return {
    positionedText: { items: positionedItems },
    representedPageIndexes: pages.map((page) => page.pageIndex),
  };
}

function validatePages(
  pages: unknown,
  sourceMethod: SourceMethod,
): readonly ValidatedPage[] {
  if (!Array.isArray(pages)) {
    throw new ScreenplayConversionError("INVALID_POSITIONED_TEXT_PAGE");
  }

  const validatedPages: ValidatedPage[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    validatedPages.push(validatePage(pages[pageIndex], sourceMethod));
  }

  return validatedPages;
}

function validatePage(page: unknown, sourceMethod: SourceMethod): ValidatedPage {
  if (
    !isRecord(page) ||
    !isPageIndex(page.pageIndex) ||
    !Array.isArray(page.items)
  ) {
    throw new ScreenplayConversionError("INVALID_POSITIONED_TEXT_PAGE");
  }

  const validatedItems: PositionedTextPageItem[] = [];

  for (let itemIndex = 0; itemIndex < page.items.length; itemIndex += 1) {
    validatedItems.push(validateItem(page.items[itemIndex]));
  }

  return {
    pageIndex: page.pageIndex,
    items: validatedItems,
    sourceMethod,
  };
}

function validateItem(item: unknown): PositionedTextPageItem {
  if (
    !isRecord(item) ||
    typeof item.text !== "string" ||
    !isBounds(item.bounds) ||
    !isFont(item.font) ||
    !isStyle(item.style)
  ) {
    throw new ScreenplayConversionError("INVALID_POSITIONED_TEXT_PAGE");
  }

  return item as unknown as PositionedTextPageItem;
}

function assertUniquePageIndexes(pages: readonly ValidatedPage[]): void {
  const pageIndexes = new Set<number>();

  for (const page of pages) {
    if (pageIndexes.has(page.pageIndex)) {
      throw new ScreenplayConversionError("DUPLICATE_POSITIONED_TEXT_PAGE");
    }

    pageIndexes.add(page.pageIndex);
  }
}

function assertDisjointPageIndexes(
  nativePages: readonly ValidatedPage[],
  ocrPages: readonly ValidatedPage[],
): void {
  const nativePageIndexes = new Set(
    nativePages.map((page) => page.pageIndex),
  );

  if (ocrPages.some((page) => nativePageIndexes.has(page.pageIndex))) {
    throw new ScreenplayConversionError("OVERLAPPING_POSITIONED_TEXT_PAGE");
  }
}

function isPageIndex(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function isBounds(value: unknown): value is PositionedTextPageItem["bounds"] {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  );
}

function isFont(value: unknown): value is PositionedTextPageItem["font"] {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isFiniteNumber(value.size)
  );
}

function isStyle(value: unknown): value is PositionedTextPageItem["style"] {
  return (
    isRecord(value) &&
    typeof value.bold === "boolean" &&
    typeof value.italic === "boolean" &&
    typeof value.underline === "boolean" &&
    typeof value.strikeout === "boolean"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
