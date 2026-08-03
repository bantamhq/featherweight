import type { PhysicalTextLine } from "./physical-lines.js";

export type SuppressionReason =
  | "recurring-page-artifact"
  | "source-page-number"
  | "screenplay-pagination";

export type NormalizationDiagnosticCode = "AMBIGUOUS_PAGE_ARTIFACT";

export interface NormalizedText {
  readonly pages: readonly NormalizedTextPage[];
  readonly suppressed: readonly SuppressedPhysicalTextLine[];
  readonly diagnostics: readonly NormalizationDiagnostic[];
}

export interface NormalizedTextPage {
  readonly pageIndex: number;
  readonly lines: readonly PhysicalTextLine[];
}

export interface SuppressedPhysicalTextLine {
  readonly line: PhysicalTextLine;
  readonly reasons: readonly SuppressionReason[];
}

export interface NormalizationDiagnostic {
  readonly code: NormalizationDiagnosticCode;
  readonly pageIndex: number;
  readonly sourceIndexes: readonly number[];
  readonly candidateReasons: readonly SuppressionReason[];
}
