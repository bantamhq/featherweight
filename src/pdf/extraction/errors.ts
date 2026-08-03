export type PdfExtractionErrorCode =
  | "PDF_BINDING_UNAVAILABLE"
  | "PDF_EXTRACTION_FAILED"
  | "PDF_ITEM_TRANSLATION_FAILED";

const errorMessages: Record<PdfExtractionErrorCode, string> = {
  PDF_BINDING_UNAVAILABLE: "PDF native binding is unavailable.",
  PDF_EXTRACTION_FAILED: "PDF extraction failed.",
  PDF_ITEM_TRANSLATION_FAILED: "PDF item translation failed.",
};

export class PdfExtractionError extends Error {
  readonly code: PdfExtractionErrorCode;
  override readonly cause: Error;

  constructor(code: PdfExtractionErrorCode, cause: unknown) {
    const errorCause = toErrorCause(cause);

    super(errorMessages[code], { cause: errorCause });
    this.name = "PdfExtractionError";
    this.code = code;
    this.cause = errorCause;
  }
}

function toErrorCause(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }

  return new Error("Unknown PDF extraction failure.");
}
