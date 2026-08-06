import type { ScreenplayDocument } from "../core/screenplay-document.js";
import { screenplayDocumentToFDX } from "../fdx/screenplay-document-to-fdx.js";
import { screenplayDocumentToFountain } from "../fountain/screenplay-document-to-fountain.js";
import { PdfExtractionError } from "../pdf/extraction/errors.js";
import { extractPositionedPdfText } from "../pdf/extraction/pdf-inspector.js";
import { inspectScreenplayPdf } from "../pdf/inspection.js";
import { PdfInspectionError } from "../pdf/inspection-error.js";
import { createScreenplayDocument } from "./create-screenplay-document.js";
import type { PositionedTextPage } from "./positioned-text-page.js";
import { positionedTextToPages } from "./positioned-text-pages.js";
import { ScreenplayConversionError } from "./screenplay-conversion-error.js";

interface PageRoutes {
  readonly nativePageIndexes: readonly number[];
  readonly ocrPageIndexes: readonly number[];
}

export function screenplayToJSON(
  pdfBytes: Uint8Array,
  nativePageIndexes: readonly number[],
  ocrPageIndexes: readonly number[],
): string {
  const document = createDocumentFromPdf(
    pdfBytes,
    nativePageIndexes,
    ocrPageIndexes,
  );

  return `${JSON.stringify(document, null, 2)}\n`;
}

export function screenplayToFountain(
  pdfBytes: Uint8Array,
  nativePageIndexes: readonly number[],
  ocrPageIndexes: readonly number[],
): string {
  const document = createDocumentFromPdf(
    pdfBytes,
    nativePageIndexes,
    ocrPageIndexes,
  );

  return screenplayDocumentToFountain(document);
}

export function screenplayToFDX(
  pdfBytes: Uint8Array,
  nativePageIndexes: readonly number[],
  ocrPageIndexes: readonly number[],
): string {
  const document = createDocumentFromPdf(
    pdfBytes,
    nativePageIndexes,
    ocrPageIndexes,
  );

  return screenplayDocumentToFDX(document);
}

function createDocumentFromPdf(
  pdfBytes: Uint8Array,
  nativePageIndexes: unknown,
  ocrPageIndexes: unknown,
): ScreenplayDocument {
  const routes = validatePageRoutes(nativePageIndexes, ocrPageIndexes);

  try {
    const inspection = inspectScreenplayPdf(pdfBytes);

    assertRoutesWithinPdf(routes, inspection.pageCount);

    const nativePages = extractNativePages(pdfBytes, routes.nativePageIndexes);
    const ocrPages = routes.ocrPageIndexes.map(emptyPage);

    return createScreenplayDocument(nativePages, ocrPages);
  } catch (error) {
    if (
      error instanceof PdfExtractionError ||
      error instanceof PdfInspectionError
    ) {
      throw new ScreenplayConversionError("PDF_PROCESSING_FAILED");
    }

    throw error;
  }
}

function validatePageRoutes(
  nativePageIndexes: unknown,
  ocrPageIndexes: unknown,
): PageRoutes {
  const validatedNativePageIndexes = validatePageIndexes(nativePageIndexes);
  const validatedOcrPageIndexes = validatePageIndexes(ocrPageIndexes);
  const nativePageIndexSet = new Set(validatedNativePageIndexes);

  if (
    validatedOcrPageIndexes.some((pageIndex) =>
      nativePageIndexSet.has(pageIndex)
    )
  ) {
    throw new ScreenplayConversionError("OVERLAPPING_PAGE_INDEX");
  }

  return {
    nativePageIndexes: [...validatedNativePageIndexes].sort(
      (left, right) => left - right,
    ),
    ocrPageIndexes: [...validatedOcrPageIndexes].sort(
      (left, right) => left - right,
    ),
  };
}

function validatePageIndexes(value: unknown): readonly number[] {
  if (!Array.isArray(value)) {
    throw new ScreenplayConversionError("INVALID_PAGE_INDEX");
  }

  const pageIndexes: number[] = [];
  const uniquePageIndexes = new Set<number>();

  for (const pageIndex of value) {
    if (
      typeof pageIndex !== "number" ||
      !Number.isInteger(pageIndex) ||
      pageIndex < 0
    ) {
      throw new ScreenplayConversionError("INVALID_PAGE_INDEX");
    }

    if (uniquePageIndexes.has(pageIndex)) {
      throw new ScreenplayConversionError("DUPLICATE_PAGE_INDEX");
    }

    uniquePageIndexes.add(pageIndex);
    pageIndexes.push(pageIndex);
  }

  return pageIndexes;
}

function assertRoutesWithinPdf(routes: PageRoutes, pageCount: number): void {
  if (
    [...routes.nativePageIndexes, ...routes.ocrPageIndexes].some(
      (pageIndex) => pageIndex >= pageCount,
    )
  ) {
    throw new ScreenplayConversionError("INVALID_PAGE_INDEX");
  }
}

function extractNativePages(
  pdfBytes: Uint8Array,
  nativePageIndexes: readonly number[],
): readonly PositionedTextPage[] {
  if (nativePageIndexes.length === 0) {
    return [];
  }

  const extractedPages = positionedTextToPages(
    extractPositionedPdfText(pdfBytes, nativePageIndexes),
  );
  const extractedPagesByIndex = new Map(
    extractedPages.map((page) => [page.pageIndex, page]),
  );

  return nativePageIndexes.map(
    (pageIndex) => extractedPagesByIndex.get(pageIndex) ?? emptyPage(pageIndex),
  );
}

function emptyPage(pageIndex: number): PositionedTextPage {
  return { pageIndex, items: [] };
}
