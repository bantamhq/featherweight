import { classifyPdfForOcr } from "./extraction/pdf-inspector.js";

export interface PdfInspection {
  readonly pageCount: number;
  readonly pagesNeedingOcr: readonly number[];
}

export function inspectScreenplayPdf(pdfBytes: Uint8Array): PdfInspection {
  return classifyPdfForOcr(pdfBytes);
}
