export type ScreenplayConversionErrorCode =
  | "INVALID_POSITIONED_TEXT_PAGE"
  | "DUPLICATE_POSITIONED_TEXT_PAGE"
  | "OVERLAPPING_POSITIONED_TEXT_PAGE";

const errorMessages: Record<ScreenplayConversionErrorCode, string> = {
  INVALID_POSITIONED_TEXT_PAGE: "Positioned text page input is invalid.",
  DUPLICATE_POSITIONED_TEXT_PAGE:
    "Positioned text page input contains a duplicate page index.",
  OVERLAPPING_POSITIONED_TEXT_PAGE: "Native and OCR page inputs overlap.",
};

export class ScreenplayConversionError extends Error {
  readonly code: ScreenplayConversionErrorCode;

  constructor(code: ScreenplayConversionErrorCode) {
    super(errorMessages[code]);
    this.name = "ScreenplayConversionError";
    this.code = code;
  }
}
