import type {
  PhysicalText,
  PhysicalTextLine,
} from "../../core/physical-lines.js";
import type {
  NormalizationDiagnostic,
  NormalizedText,
  NormalizedTextPage,
  SuppressedPhysicalTextLine,
} from "../../core/normalized-text.js";
import { detectPageArtifacts } from "./page-artifacts.js";

export function normalizeNativePhysicalText(
  physicalText: PhysicalText,
): NormalizedText {
  const decisions = detectPageArtifacts(physicalText);
  const activeLinesByPage = new Map<number, PhysicalTextLine[]>();
  const suppressed: SuppressedPhysicalTextLine[] = [];
  const diagnostics: NormalizationDiagnostic[] = [];

  for (const line of physicalText.lines) {
    if (!activeLinesByPage.has(line.pageIndex)) {
      activeLinesByPage.set(line.pageIndex, []);
    }

    const reasons = decisions.suppressionReasons.get(line);

    if (reasons) {
      suppressed.push({ line, reasons: [...reasons] });
      continue;
    }

    activeLinesByPage.get(line.pageIndex)!.push(line);

    const diagnostic = decisions.diagnostics.get(line);

    if (diagnostic) {
      diagnostics.push(diagnostic);
    }
  }

  const pages: NormalizedTextPage[] = [...activeLinesByPage]
    .sort(([leftPageIndex], [rightPageIndex]) => leftPageIndex - rightPageIndex)
    .map(([pageIndex, lines]) => ({ pageIndex, lines }));

  return { pages, suppressed, diagnostics };
}
