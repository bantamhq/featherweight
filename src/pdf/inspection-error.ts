export type PdfInspectionErrorCode =
  | "PDF_BINDING_UNAVAILABLE"
  | "PDF_INSPECTION_FAILED";

const errorMessages: Record<PdfInspectionErrorCode, string> = {
  PDF_BINDING_UNAVAILABLE: "PDF native binding is unavailable.",
  PDF_INSPECTION_FAILED: "PDF inspection failed.",
};

export class PdfInspectionError extends Error {
  readonly code: PdfInspectionErrorCode;
  override readonly cause: Error;

  constructor(code: PdfInspectionErrorCode, cause: unknown) {
    const errorCause = toErrorCause(cause);

    super(errorMessages[code], { cause: errorCause });
    this.name = "PdfInspectionError";
    this.code = code;
    this.cause = errorCause;
  }
}

function toErrorCause(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }

  return new Error("Unknown PDF inspection failure.");
}
