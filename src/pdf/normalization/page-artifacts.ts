import type {
  PhysicalText,
  PhysicalTextLine,
  PhysicalTextSpan,
} from "../../core/physical-lines.js";
import type {
  NormalizationDiagnostic,
  SuppressionReason,
} from "../../core/normalized-text.js";

export interface PageArtifactDecisions {
  readonly diagnostics: ReadonlyMap<PhysicalTextLine, NormalizationDiagnostic>;
  readonly suppressionReasons: ReadonlyMap<
    PhysicalTextLine,
    ReadonlySet<SuppressionReason>
  >;
}

interface TextFragment {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly line: PhysicalTextLine;
  readonly style: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

interface NumberedPageCandidate {
  readonly line: PhysicalTextLine;
  readonly value: number;
}

interface DocumentGeometry {
  readonly bottomBoundary: number;
  readonly horizontalMidpoint: number;
  readonly topBoundary: number;
}

interface CharacterCue {
  readonly continued: boolean;
  readonly line: PhysicalTextLine;
  readonly name: string;
}

const moreMarker = "(MORE)";
const continuedMarker = "(CONTINUED)";
const continuedHeaderPattern = /^CONTINUED:\s*\(\d+\)$/;
const continuedCuePattern =
  /^([A-Z][A-Z0-9 .'-]*?)(?: \((?:V\.?O\.?|O\.?S\.?)\))? \(CONT['’]D\)$/;
const extendedCuePattern =
  /^([A-Z][A-Z0-9 .'-]*?) \((?:V\.?O\.?|O\.?S\.?)\)$/;
const bareCuePattern = /^[A-Z][A-Z0-9 .'-]*$/;
const pageNumberPattern = /^(\d+)\.$/;

export function detectPageArtifacts(
  physicalText: PhysicalText,
): PageArtifactDecisions {
  const suppressionReasons = new Map<
    PhysicalTextLine,
    Set<SuppressionReason>
  >();
  const diagnostics = new Map<
    PhysicalTextLine,
    NormalizationDiagnostic
  >();

  if (physicalText.lines.length === 0) {
    return { suppressionReasons, diagnostics };
  }

  const geometry = measureDocumentGeometry(physicalText.lines);

  detectRecurringArtifacts(physicalText.lines, suppressionReasons);
  detectSourcePageNumbers(
    physicalText.lines,
    geometry,
    suppressionReasons,
  );
  detectExplicitPaginationMarkers(
    physicalText.lines,
    geometry,
    suppressionReasons,
    diagnostics,
  );
  detectContinuedCharacterCues(
    physicalText.lines,
    geometry,
    suppressionReasons,
    diagnostics,
  );

  return { suppressionReasons, diagnostics };
}

function detectRecurringArtifacts(
  lines: readonly PhysicalTextLine[],
  suppressionReasons: Map<PhysicalTextLine, Set<SuppressionReason>>,
): void {
  const documentPageCount = new Set(lines.map((line) => line.pageIndex)).size;
  const fragmentsByText = Map.groupBy(
    lines.flatMap(createTextFragments).filter(isRecurringArtifactFragment),
    (fragment) => fragment.text,
  );

  for (const fragments of fragmentsByText.values()) {
    const clusters: TextFragment[][] = [];

    for (const fragment of fragments) {
      const cluster = clusters.find((candidate) =>
        haveStablePresentation(candidate[0]!, fragment),
      );

      if (cluster) {
        cluster.push(fragment);
        continue;
      }

      clusters.push([fragment]);
    }

    for (const cluster of clusters) {
      const fragmentsByPage = Map.groupBy(
        cluster,
        (fragment) => fragment.line.pageIndex,
      );
      const unambiguousOccurrences = [...fragmentsByPage.values()]
        .map((pageFragments) => [
          ...new Map(
            pageFragments.map((fragment) => [fragment.line, fragment]),
          ).values(),
        ])
        .filter((pageFragments) => pageFragments.length === 1)
        .map((pageFragments) => pageFragments[0]!);
      const coversDocumentMajority =
        unambiguousOccurrences.length / documentPageCount > 0.5;

      if (unambiguousOccurrences.length < 3 || !coversDocumentMajority) {
        continue;
      }

      for (const fragment of unambiguousOccurrences) {
        addSuppressionReason(
          suppressionReasons,
          fragment.line,
          "recurring-page-artifact",
        );
      }
    }
  }
}

function createTextFragments(line: PhysicalTextLine): readonly TextFragment[] {
  const fragments = new Map<string, TextFragment>();

  for (const span of line.spans) {
    const text = line.text.slice(span.start, span.end).trim();

    if (text.length === 0) {
      continue;
    }

    fragments.set(text, createTextFragment(line, span, text));
  }

  const firstSpan = line.spans[0];

  if (firstSpan) {
    const text = line.text.trim();

    if (!fragments.has(text)) {
      fragments.set(text, createTextFragment(line, firstSpan, text));
    }
  }

  return [...fragments.values()];
}

function createTextFragment(
  line: PhysicalTextLine,
  span: PhysicalTextSpan,
  text: string,
): TextFragment {
  return {
    fontFamily: span.font.name.replace(/-\d+$/, "").toLowerCase(),
    fontSize: span.font.size,
    line,
    style: JSON.stringify(span.style),
    text,
    x: span.bounds.x,
    y: span.bounds.y,
  };
}

function isRecurringArtifactFragment(fragment: TextFragment): boolean {
  if (fragment.text.length < 5) {
    return false;
  }

  return !isExplicitPaginationText(fragment.text);
}

function haveStablePresentation(
  left: TextFragment,
  right: TextFragment,
): boolean {
  const positionTolerance = Math.max(left.fontSize, right.fontSize) / 2;

  return (
    left.fontFamily === right.fontFamily &&
    left.style === right.style &&
    Math.abs(left.fontSize - right.fontSize) <= 0.25 &&
    Math.abs(left.x - right.x) <= positionTolerance &&
    Math.abs(left.y - right.y) <= positionTolerance
  );
}

function detectSourcePageNumbers(
  lines: readonly PhysicalTextLine[],
  geometry: DocumentGeometry,
  suppressionReasons: Map<PhysicalTextLine, Set<SuppressionReason>>,
): void {
  const candidates = lines.flatMap((line): readonly NumberedPageCandidate[] => {
    const match = pageNumberPattern.exec(line.text.trim());

    if (!match || !isAtTopBoundary(line, geometry)) {
      return [];
    }

    if (line.bounds.x < geometry.horizontalMidpoint) {
      return [];
    }

    return [{ line, value: Number(match[1]) }];
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const previous = candidates[index - 1];
    const next = candidates[index + 1];

    if (
      !areSequentialPageNumbers(previous, candidate) &&
      !areSequentialPageNumbers(candidate, next)
    ) {
      continue;
    }

    addSuppressionReason(
      suppressionReasons,
      candidate.line,
      "source-page-number",
    );
  }
}

function areSequentialPageNumbers(
  left: NumberedPageCandidate | undefined,
  right: NumberedPageCandidate | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    right.line.pageIndex === left.line.pageIndex + 1 &&
    right.value === left.value + 1
  );
}

function detectExplicitPaginationMarkers(
  lines: readonly PhysicalTextLine[],
  geometry: DocumentGeometry,
  suppressionReasons: Map<PhysicalTextLine, Set<SuppressionReason>>,
  diagnostics: Map<PhysicalTextLine, NormalizationDiagnostic>,
): void {
  for (const line of lines) {
    const fragments = createTextFragments(line).map((fragment) => fragment.text);
    const lineText = line.text.trim();
    const hasBottomMarker =
      lineText === moreMarker || lineText === continuedMarker;
    const hasTopMarker = fragments.some((text) =>
      continuedHeaderPattern.test(text),
    );

    if (hasBottomMarker) {
      if (isAtBottomBoundary(line, geometry)) {
        addSuppressionReason(
          suppressionReasons,
          line,
          "screenplay-pagination",
        );
      } else {
        addPaginationDiagnostic(diagnostics, line);
      }
    }

    if (!hasTopMarker) {
      continue;
    }

    if (isAtTopBoundary(line, geometry)) {
      addSuppressionReason(
        suppressionReasons,
        line,
        "screenplay-pagination",
      );
    } else {
      addPaginationDiagnostic(diagnostics, line);
    }
  }
}

function detectContinuedCharacterCues(
  lines: readonly PhysicalTextLine[],
  geometry: DocumentGeometry,
  suppressionReasons: Map<PhysicalTextLine, Set<SuppressionReason>>,
  diagnostics: Map<PhysicalTextLine, NormalizationDiagnostic>,
): void {
  const linesByPage = Map.groupBy(lines, (line) => line.pageIndex);
  const orderedPageIndexes = [...linesByPage.keys()].sort(
    (left, right) => left - right,
  );

  for (let pageOffset = 1; pageOffset < orderedPageIndexes.length; pageOffset += 1) {
    const pageIndex = orderedPageIndexes[pageOffset]!;
    const previousPageIndex = orderedPageIndexes[pageOffset - 1]!;

    if (pageIndex !== previousPageIndex + 1) {
      continue;
    }

    const pageLines = linesByPage.get(pageIndex)!;
    const previousPageLines = linesByPage.get(previousPageIndex)!;
    const firstContentIndex = pageLines.findIndex(
      (line) => !suppressionReasons.has(line),
    );

    if (firstContentIndex < 0) {
      continue;
    }

    const firstContentLine = pageLines[firstContentIndex]!;
    const currentCue = parseCharacterCue(firstContentLine);

    if (!currentCue || !isAtTopBoundary(firstContentLine, geometry)) {
      continue;
    }

    const trailingMoreLine = findTrailingMoreLine(
      previousPageLines,
      suppressionReasons,
    );
    const previousContentLine = findPreviousContentLine(
      previousPageLines,
      trailingMoreLine,
      suppressionReasons,
    );
    const followingContentLine = pageLines
      .slice(firstContentIndex + 1)
      .find((line) => !suppressionReasons.has(line));
    const previousCue = findPreviousMatchingColumnCue(
      previousPageLines,
      currentCue,
      suppressionReasons,
    );
    const hasContinuationContext =
      previousContentLine !== undefined &&
      followingContentLine !== undefined &&
      previousCue?.name === currentCue.name &&
      hasDialogueIndent(firstContentLine, previousContentLine) &&
      hasDialogueIndent(firstContentLine, followingContentLine);

    if (hasContinuationContext) {
      addSuppressionReason(
        suppressionReasons,
        firstContentLine,
        "screenplay-pagination",
      );

      if (trailingMoreLine) {
        addSuppressionReason(
          suppressionReasons,
          trailingMoreLine,
          "screenplay-pagination",
        );
        diagnostics.delete(trailingMoreLine);
      }

      continue;
    }

    if (currentCue.continued) {
      addPaginationDiagnostic(diagnostics, firstContentLine);
    }
  }
}

function findTrailingMoreLine(
  lines: readonly PhysicalTextLine[],
  suppressionReasons: ReadonlyMap<PhysicalTextLine, ReadonlySet<SuppressionReason>>,
): PhysicalTextLine | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;

    if (line.text.trim() === moreMarker) {
      return line;
    }

    if (!suppressionReasons.has(line)) {
      return undefined;
    }
  }

  return undefined;
}

function findPreviousContentLine(
  lines: readonly PhysicalTextLine[],
  trailingMoreLine: PhysicalTextLine | undefined,
  suppressionReasons: ReadonlyMap<PhysicalTextLine, ReadonlySet<SuppressionReason>>,
): PhysicalTextLine | undefined {
  const searchEnd = trailingMoreLine
    ? lines.indexOf(trailingMoreLine)
    : lines.length;

  return lines
    .slice(0, searchEnd)
    .findLast((line) => !suppressionReasons.has(line));
}

function findPreviousMatchingColumnCue(
  lines: readonly PhysicalTextLine[],
  currentCue: CharacterCue,
  suppressionReasons: ReadonlyMap<PhysicalTextLine, ReadonlySet<SuppressionReason>>,
): CharacterCue | undefined {
  const currentFontSize = currentCue.line.spans[0]?.font.size ?? 12;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;

    if (suppressionReasons.has(line)) {
      continue;
    }

    const cue = parseCharacterCue(line);

    if (!cue) {
      continue;
    }

    if (Math.abs(line.bounds.x - currentCue.line.bounds.x) <= currentFontSize * 2) {
      return cue;
    }
  }

  return undefined;
}

function parseCharacterCue(line: PhysicalTextLine): CharacterCue | undefined {
  const text = line.text.trim();
  const continuedMatch = continuedCuePattern.exec(text);

  if (continuedMatch) {
    return { continued: true, line, name: continuedMatch[1]! };
  }

  const extendedMatch = extendedCuePattern.exec(text);

  if (extendedMatch) {
    return { continued: false, line, name: extendedMatch[1]! };
  }

  if (!bareCuePattern.test(text)) {
    return undefined;
  }

  return { continued: false, line, name: text };
}

function hasDialogueIndent(
  cueLine: PhysicalTextLine,
  contentLine: PhysicalTextLine,
): boolean {
  const fontSize = cueLine.spans[0]?.font.size ?? 12;
  const indent = cueLine.bounds.x - contentLine.bounds.x;

  return indent >= fontSize * 2 && indent <= fontSize * 8;
}

function measureDocumentGeometry(
  lines: readonly PhysicalTextLine[],
): DocumentGeometry {
  const fontSizes = lines
    .flatMap((line) => line.spans.map((span) => span.font.size))
    .sort((left, right) => left - right);
  const typicalFontSize = fontSizes[Math.floor(fontSizes.length / 2)] ?? 12;
  const minimumY = Math.min(...lines.map((line) => line.bounds.y));
  const maximumY = Math.max(...lines.map((line) => line.bounds.y));
  const minimumX = Math.min(...lines.map((line) => line.bounds.x));
  const maximumRight = Math.max(
    ...lines.map((line) => line.bounds.x + line.bounds.width),
  );
  const boundaryDepth = typicalFontSize * 4;

  return {
    bottomBoundary: minimumY + boundaryDepth,
    horizontalMidpoint: (minimumX + maximumRight) / 2,
    topBoundary: maximumY - boundaryDepth,
  };
}

function isAtTopBoundary(
  line: PhysicalTextLine,
  geometry: DocumentGeometry,
): boolean {
  return line.bounds.y >= geometry.topBoundary;
}

function isAtBottomBoundary(
  line: PhysicalTextLine,
  geometry: DocumentGeometry,
): boolean {
  return line.bounds.y <= geometry.bottomBoundary;
}

function isExplicitPaginationText(text: string): boolean {
  return (
    text === moreMarker ||
    text === continuedMarker ||
    continuedHeaderPattern.test(text) ||
    continuedCuePattern.test(text)
  );
}

function addSuppressionReason(
  suppressionReasons: Map<PhysicalTextLine, Set<SuppressionReason>>,
  line: PhysicalTextLine,
  reason: SuppressionReason,
): void {
  const reasons = suppressionReasons.get(line);

  if (reasons) {
    reasons.add(reason);
    return;
  }

  suppressionReasons.set(line, new Set([reason]));
}

function addPaginationDiagnostic(
  diagnostics: Map<PhysicalTextLine, NormalizationDiagnostic>,
  line: PhysicalTextLine,
): void {
  diagnostics.set(line, {
    code: "AMBIGUOUS_PAGE_ARTIFACT",
    pageIndex: line.pageIndex,
    sourceIndexes: line.spans.map((span) => span.sourceIndex),
    candidateReasons: ["screenplay-pagination"],
  });
}
