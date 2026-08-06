export type ScreenplayConversionErrorCode =
  | "INVALID_PAGE_INDEX"
  | "DUPLICATE_PAGE_INDEX"
  | "OVERLAPPING_PAGE_INDEX"
  | "PDF_PROCESSING_FAILED"
  | "INVALID_FDX_TEXT";

const errorMessages: Record<ScreenplayConversionErrorCode, string> = {
  INVALID_PAGE_INDEX: "Page routing contains an invalid page index.",
  DUPLICATE_PAGE_INDEX: "Page routing contains a duplicate page index.",
  OVERLAPPING_PAGE_INDEX: "Native and OCR page routes overlap.",
  PDF_PROCESSING_FAILED: "PDF could not be converted.",
  INVALID_FDX_TEXT: "Screenplay text cannot be represented in FDX XML.",
};

export class ScreenplayConversionError extends Error {
  readonly code: ScreenplayConversionErrorCode;

  constructor(code: ScreenplayConversionErrorCode) {
    super(errorMessages[code]);
    this.name = "ScreenplayConversionError";
    this.code = code;
  }
}
