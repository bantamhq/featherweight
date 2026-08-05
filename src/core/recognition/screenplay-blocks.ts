import type { ScreenplayLayout } from "../layout/screenplay-layout.js";
import { isUppercaseText } from "../layout/screenplay-sequences.js";
import type { PhysicalTextLine } from "../physical-lines.js";
import type {
  Action,
  SceneHeading,
  TitlePageField,
} from "../screenplay-document.js";
import {
  createStyledText,
  type LineJoin,
} from "./styled-text.js";
import type { SentenceSpacingConvention } from "./sentence-spacing.js";

export interface TitlePageExtraction {
  readonly fields: readonly TitlePageField[];
  readonly bodyLines: readonly PhysicalTextLine[];
  readonly unattributedLines: readonly PhysicalTextLine[];
}

export interface SceneHeadingEvidence {
  readonly heading: PhysicalTextLine;
  readonly headingLines: readonly PhysicalTextLine[];
  readonly numberFragments: readonly PhysicalTextLine[];
  readonly sceneNumber: string | null;
}

export interface ActionLineGroup {
  readonly lines: readonly PhysicalTextLine[];
  readonly lineJoins: readonly LineJoin[];
  readonly nextIndex: number;
}

const conventionalSceneHeading = /^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/u;
const conventionalCredit =
  /^(?:written|prepared|screenplay|teleplay)\s+(?:by|for)$/iu;
const draftDate = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/u;
const copyrightNotice = /^(?:copyright\b|©|\(c\))/iu;

export function extractTitlePage(
  lines: readonly PhysicalTextLine[],
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): TitlePageExtraction {
  const actionX = layout.action?.x;

  if (actionX === undefined) {
    return { fields: [], bodyLines: lines, unattributedLines: [] };
  }

  const firstPageIndex = lines[0]!.pageIndex;

  if (firstPageIndex !== 0) {
    return { fields: [], bodyLines: lines, unattributedLines: [] };
  }

  const firstPageLines = lines.filter((line) => line.pageIndex === firstPageIndex);
  const bodyLines = lines.filter((line) => line.pageIndex !== firstPageIndex);
  const isSeparateTitlePage =
    firstPageLines.length > 0 &&
    bodyLines.length > 0 &&
    bodyLines.some((line) =>
      isSceneHeadingLine(line, layout, coordinateTolerance),
    );

  if (!isSeparateTitlePage) {
    return { fields: [], bodyLines: lines, unattributedLines: [] };
  }

  const fields = recognizeConventionalTitlePage(
    firstPageLines,
    coordinateTolerance,
  );

  if (fields === null) {
    return {
      fields: [],
      bodyLines: lines,
      unattributedLines: firstPageLines,
    };
  }

  return { fields, bodyLines, unattributedLines: [] };
}

function recognizeConventionalTitlePage(
  lines: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): readonly TitlePageField[] | null {
  const footerStartIndex = findTitleFooterStartIndex(lines);
  const upperLines = lines.slice(0, footerStartIndex);
  const footerLines = lines.slice(footerStartIndex);
  const upperFields = recognizeUpperTitleFields(
    upperLines,
    coordinateTolerance,
  );
  let footerFields = recognizeFooterTitleFields(
    footerLines,
    coordinateTolerance,
  );

  if (
    upperFields.length === 0 &&
    footerFields.length === 0 &&
    footerStartIndex === lines.length
  ) {
    footerFields = recognizeFooterTitleFields(lines, coordinateTolerance);
  }

  const fields = [...upperFields, ...footerFields];

  return fields.length > 0 ? fields : null;
}

function findTitleFooterStartIndex(
  lines: readonly PhysicalTextLine[],
): number {
  let largestGap = 0;
  let footerStartIndex = lines.length;

  for (let index = 1; index < lines.length; index += 1) {
    const gap = verticalGapInLineHeights(lines[index - 1]!, lines[index]!);

    if (gap >= 6 && gap > largestGap) {
      largestGap = gap;
      footerStartIndex = index;
    }
  }

  if (
    footerStartIndex === lines.length &&
    (draftDate.test(lines[0]!.text.trim()) ||
      copyrightNotice.test(lines[0]!.text.trim()))
  ) {
    return 0;
  }

  return footerStartIndex;
}

function recognizeUpperTitleFields(
  lines: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): readonly TitlePageField[] {
  if (
    lines.length === 0 ||
    !lines.every((line) =>
      haveMatchingCenters(lines[0]!, line, coordinateTolerance),
    )
  ) {
    return [];
  }

  const creditIndex = lines.findIndex((line) =>
    conventionalCredit.test(line.text.trim()),
  );

  if (creditIndex < 0) {
    let titleValueCount = 1;

    while (
      titleValueCount < lines.length &&
      areVerticallyAdjacent(
        lines[titleValueCount - 1]!,
        lines[titleValueCount]!,
        1.5,
      )
    ) {
      titleValueCount += 1;
    }

    return [createTitleField("Title", lines.slice(0, titleValueCount))];
  }

  const fields: TitlePageField[] = [];
  const titleValues = lines.slice(0, creditIndex);
  const credit = lines[creditIndex]!;
  const possibleAuthor = lines[creditIndex + 1];
  const hasAuthor =
    possibleAuthor !== undefined &&
    verticalGapInLineHeights(credit, possibleAuthor) <= 2.5;
  const sourceStartIndex = creditIndex + (hasAuthor ? 2 : 1);
  const source = lines.slice(sourceStartIndex);

  if (titleValues.length > 0) {
    fields.push(createTitleField("Title", titleValues));
  }

  fields.push(createTitleField("Credit", [credit]));

  if (hasAuthor) {
    fields.push(createTitleField("Author", [possibleAuthor]));
  }

  if (source.length > 0) {
    fields.push(createTitleField("Source", source));
  }

  return fields;
}

function recognizeFooterTitleFields(
  lines: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): readonly TitlePageField[] {
  if (lines.length === 0) {
    return [];
  }

  const independentFooter = recognizeIndependentFooter(
    lines,
    coordinateTolerance,
  );

  if (independentFooter !== null) {
    return [
      createTitleField("Notes", independentFooter.notes),
      createTitleField("Copyright", [independentFooter.copyright]),
    ];
  }

  const fields: TitlePageField[] = [];
  const copyrightIndex = lines.findIndex((line) =>
    copyrightNotice.test(line.text.trim()),
  );
  const copyright =
    copyrightIndex < 0 ? undefined : lines[copyrightIndex];
  const conventionalLines = lines.filter((_, index) => index !== copyrightIndex);
  const hasDraftDate = draftDate.test(conventionalLines[0]?.text.trim() ?? "");
  const contactCandidate = conventionalLines.slice(hasDraftDate ? 1 : 0);
  const originTolerance = Math.max(
    coordinateTolerance,
    conventionalLines[0]?.bounds.height ?? 0,
  );
  const hasMatchingOrigins = contactCandidate.every(
    (line) =>
      Math.abs(line.bounds.x - contactCandidate[0]!.bounds.x) <=
      originTolerance,
  );
  const hasMatchingRightEdges = contactCandidate.every(
    (line) =>
      Math.abs(
        line.bounds.x +
          line.bounds.width -
          (contactCandidate[0]!.bounds.x + contactCandidate[0]!.bounds.width),
      ) <= originTolerance,
  );
  const hasAdjacentContactLines = contactCandidate
    .slice(1)
    .every((line, index) =>
      areVerticallyAdjacent(contactCandidate[index]!, line, 1.5),
    );
  const hasSupportedContactGeometry = hasDraftDate
    ? contactCandidate.length === 0 ||
      (verticalGapInLineHeights(
        conventionalLines[0]!,
        contactCandidate[0]!,
      ) >= 0.75 &&
        verticalGapInLineHeights(
          conventionalLines[0]!,
          contactCandidate[0]!,
        ) <= 2.5 &&
        hasMatchingOrigins &&
        hasAdjacentContactLines)
    : contactCandidate.length > 1 &&
      hasMatchingOrigins &&
      hasAdjacentContactLines;
  const contact = hasSupportedContactGeometry ? contactCandidate : [];

  if (hasDraftDate) {
    fields.push(createTitleField("Draft date", [conventionalLines[0]!]));
  }

  if (contact.length > 0) {
    fields.push(createTitleField("Contact", contact));
  } else if (
    !hasDraftDate &&
    copyright === undefined &&
    contactCandidate.length > 1 &&
    hasMatchingRightEdges &&
    hasAdjacentContactLines
  ) {
    fields.push(createTitleField("Notes", contactCandidate));
  }

  if (copyright !== undefined) {
    fields.push(createTitleField("Copyright", [copyright]));
  }

  return fields;
}

function recognizeIndependentFooter(
  lines: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): {
  readonly notes: readonly PhysicalTextLine[];
  readonly copyright: PhysicalTextLine;
} | null {
  if (lines.length < 2) {
    return null;
  }

  const copyright = lines.at(-1)!;
  const notes = lines.slice(0, -1);
  const rightEdgeTolerance = Math.max(
    coordinateTolerance,
    notes[0]!.bounds.height / 2,
  );
  const notesRightEdge = notes[0]!.bounds.x + notes[0]!.bounds.width;
  const hasRightAlignedNotes =
    notes.every(
      (line) =>
        Math.abs(line.bounds.x + line.bounds.width - notesRightEdge) <=
        rightEdgeTolerance,
    ) &&
    notes.slice(1).every((line, index) =>
      areVerticallyAdjacent(notes[index]!, line, 1.5),
    );
  const footerGap = verticalGapInLineHeights(notes.at(-1)!, copyright);
  const isIndependentCopyright =
    footerGap >= 2 &&
    footerGap <= 5 &&
    Math.abs(copyright.bounds.x - notes[0]!.bounds.x) > rightEdgeTolerance;

  return hasRightAlignedNotes && isIndependentCopyright
    ? { notes, copyright }
    : null;
}

export function findSceneHeadings(
  lines: readonly PhysicalTextLine[],
  reservedLines: ReadonlySet<PhysicalTextLine>,
  layout: ScreenplayLayout,
  coordinateTolerance: number,
  actionLineMeasure: number | null,
): readonly SceneHeadingEvidence[] {
  const headings: SceneHeadingEvidence[] = [];
  const consumedContinuationLines = new Set<PhysicalTextLine>();

  for (const [headingIndex, heading] of lines.entries()) {
    if (
      reservedLines.has(heading) ||
      consumedContinuationLines.has(heading) ||
      !isSceneHeadingLine(heading, layout, coordinateTolerance)
    ) {
      continue;
    }

    const continuation = lines[headingIndex + 1];
    const headingLines =
      continuation !== undefined &&
      isWrappedSceneHeadingContinuation(
        heading,
        continuation,
        reservedLines,
        layout,
        coordinateTolerance,
        actionLineMeasure,
      )
        ? [heading, continuation]
        : [heading];

    if (headingLines.length > 1) {
      consumedContinuationLines.add(headingLines[1]!);
    }

    const baselineFragments = lines.filter(
      (line) =>
        line !== heading &&
        line.pageIndex === heading.pageIndex &&
        Math.abs(line.bounds.y - heading.bounds.y) <= coordinateTolerance,
    );
    const leftFragments = baselineFragments.filter(
      (line) => line.bounds.x < heading.bounds.x,
    );
    const rightFragments = baselineFragments.filter(
      (line) => line.bounds.x > heading.bounds.x + heading.bounds.width,
    );
    const matchingNumbers = leftFragments.flatMap((left) =>
      rightFragments
        .filter((right) => right.text.trim() === left.text.trim())
        .map((right) => ({ left, right, number: left.text.trim() })),
    );
    const sceneNumber = matchingNumbers[0];

    headings.push({
      heading,
      headingLines,
      numberFragments:
        sceneNumber === undefined ? [] : [sceneNumber.left, sceneNumber.right],
      sceneNumber: sceneNumber?.number ?? null,
    });
  }

  return headings;
}

export function createSceneHeading(
  evidence: SceneHeadingEvidence,
): SceneHeading {
  return {
    type: "scene-heading",
    text: createStyledText(evidence.headingLines),
    sceneNumber: evidence.sceneNumber,
  };
}

function isWrappedSceneHeadingContinuation(
  heading: PhysicalTextLine,
  continuation: PhysicalTextLine,
  reservedLines: ReadonlySet<PhysicalTextLine>,
  layout: ScreenplayLayout,
  coordinateTolerance: number,
  actionLineMeasure: number | null,
): boolean {
  if (
    actionLineMeasure === null ||
    reservedLines.has(continuation) ||
    continuation.pageIndex !== heading.pageIndex ||
    !areVerticallyAdjacent(heading, continuation, 1.5) ||
    layout.action === null ||
    Math.abs(continuation.bounds.x - layout.action.x) > coordinateTolerance ||
    heading.bounds.width + heading.bounds.height * 5 < actionLineMeasure
  ) {
    return false;
  }

  const continuationText = continuation.text.trim();

  return (
    isUppercaseText(continuationText) &&
    continuation.spans.length > 0 &&
    continuation.spans.every((span) => span.style.bold)
  );
}

export function collectActionLines(options: {
  readonly lines: readonly PhysicalTextLine[];
  readonly startIndex: number;
  readonly blockedLines: ReadonlySet<PhysicalTextLine>;
  readonly layout: ScreenplayLayout;
  readonly coordinateTolerance: number;
  readonly actionLineMeasure: number | null;
  readonly centeredActionLines: ReadonlySet<PhysicalTextLine>;
}): ActionLineGroup {
  const { lines, startIndex } = options;
  const firstLine = lines[startIndex]!;
  const centered = options.centeredActionLines.has(firstLine);

  if (centered) {
    return collectCenteredActionLines(options);
  }

  const actionLines = [firstLine];
  const lineJoins: LineJoin[] = [];
  let nextIndex = startIndex + 1;

  while (nextIndex < lines.length) {
    const previousLine = actionLines.at(-1)!;
    const nextLine = lines[nextIndex]!;

    if (
      options.blockedLines.has(nextLine) ||
      options.centeredActionLines.has(nextLine) ||
      !haveMatchingActionOrigins(
        previousLine,
        nextLine,
        options.layout,
        options.coordinateTolerance,
      ) ||
      !continuesActionParagraph(
        previousLine,
        nextLine,
        options.actionLineMeasure,
      )
    ) {
      break;
    }

    lineJoins.push(
      shouldPreserveActionLineBreak(
        previousLine,
        nextLine,
        options.actionLineMeasure,
      )
        ? "newline"
        : "wrap",
    );
    actionLines.push(nextLine);
    nextIndex += 1;
  }

  return { lines: actionLines, lineJoins, nextIndex };
}

export function createAction(
  lines: readonly PhysicalTextLine[],
  lineJoins: readonly LineJoin[],
  centeredActionLines: ReadonlySet<PhysicalTextLine>,
  sentenceSpacingConvention: SentenceSpacingConvention,
): Action {
  return {
    type: "action",
    text: createStyledText(lines, lineJoins, sentenceSpacingConvention),
    alignment: centeredActionLines.has(lines[0]!)
      ? "center"
      : "standard",
  };
}

export function inferActionLineMeasure(
  lines: readonly PhysicalTextLine[],
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): number | null {
  if (layout.action === null) {
    return null;
  }

  const widths = lines
    .filter(
      (line) =>
        Math.abs(line.bounds.x - layout.action!.x) <= coordinateTolerance,
    )
    .map((line) => line.bounds.width)
    .sort((left, right) => left - right);

  if (widths.length === 0) {
    return null;
  }

  return widths[Math.floor((widths.length - 1) * 0.9)]!;
}

export function findCenteredActionLines(
  lines: readonly PhysicalTextLine[],
  blockedLines: ReadonlySet<PhysicalTextLine>,
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): ReadonlySet<PhysicalTextLine> {
  if (layout.action === null) {
    return new Set();
  }

  const candidates = lines
    .filter(
      (line) =>
        !blockedLines.has(line) &&
        line.bounds.x > layout.action!.x + line.bounds.height * 6 &&
        !hasBaselineSibling(line, lines, coordinateTolerance),
    )
    .filter(
      (line) =>
        !matchesEstablishedRoleGeometry(line, layout, coordinateTolerance),
    );
  const candidateSet = new Set(
    lines.filter(
      (line) =>
        !blockedLines.has(line) &&
        line.bounds.x > layout.action!.x + line.bounds.height * 6 &&
        !hasBaselineSibling(line, lines, coordinateTolerance),
    ),
  );
  const centeredLines = new Set(
    candidates.filter(
      (line) =>
        isAtEstablishedScreenplayCenter(line, layout) &&
        isIsolatedFromRoleGeometry(
          line,
          lines,
          layout,
          coordinateTolerance,
        ),
    ),
  );
  const supportedGroups: {
    readonly center: number;
    readonly upper: PhysicalTextLine;
    readonly lower: PhysicalTextLine;
  }[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const upper = lines[index]!;
    const lower = lines[index + 1]!;

    if (
      !isCenteredPair(upper, lower, candidateSet, coordinateTolerance) ||
      matchesEstablishedContentGeometry(
        upper,
        layout,
        coordinateTolerance,
      ) ||
      matchesEstablishedContentGeometry(
        lower,
        layout,
        coordinateTolerance,
      ) ||
      (matchesEstablishedCueGeometry(
        upper,
        layout,
        Math.max(coordinateTolerance, upper.bounds.height / 2),
      ) &&
        matchesEstablishedCueGeometry(
          lower,
          layout,
          Math.max(coordinateTolerance, lower.bounds.height / 2),
        ))
    ) {
      continue;
    }

    const groupCenter = (lineCenter(upper) + lineCenter(lower)) / 2;

    if (
      !isCenteredGroupIsolatedFromContentGeometry(
        lines,
        index,
        groupCenter,
        candidateSet,
        layout,
        coordinateTolerance,
      )
    ) {
      continue;
    }

    supportedGroups.push({ center: groupCenter, upper, lower });
    addCenteredGroup(lines, index, groupCenter, candidateSet, centeredLines);
  }

  for (const line of candidates) {
    if (
      isIsolatedFromRoleGeometry(
        line,
        lines,
        layout,
        coordinateTolerance,
      ) &&
      supportedGroups.some(
        (group) =>
          Math.abs(lineCenter(line) - group.center) <= line.bounds.height / 4,
      )
    ) {
      centeredLines.add(line);
    }
  }

  for (const line of candidates) {
    const hasStableCenterPeer = candidates.some(
      (candidate) =>
        candidate !== line &&
        Math.abs(lineCenter(candidate) - lineCenter(line)) <=
          coordinateTolerance,
    );

    if (
      hasStableCenterPeer &&
      isAtEstablishedScreenplayCenter(line, layout) &&
      isIsolatedFromRoleGeometry(
        line,
        lines,
        layout,
        coordinateTolerance,
      )
    ) {
      centeredLines.add(line);
    }
  }

  for (let index = 0; index < lines.length - 1; index += 1) {
    const upper = lines[index]!;
    const lower = lines[index + 1]!;

    if (!isCenteredPair(upper, lower, candidateSet, coordinateTolerance)) {
      continue;
    }

    const groupCenter = (lineCenter(upper) + lineCenter(lower)) / 2;

    if (
      supportedGroups.some(
        (group) =>
          isLocallySupportedCenteredPair(
            upper,
            lower,
            group,
            coordinateTolerance,
          ),
      ) &&
      isCenteredGroupIsolatedFromContentGeometry(
        lines,
        index,
        groupCenter,
        candidateSet,
        layout,
        coordinateTolerance,
      )
    ) {
      addCenteredGroup(lines, index, groupCenter, candidateSet, centeredLines);
    }
  }

  return centeredLines;
}

function isCenteredGroupIsolatedFromContentGeometry(
  lines: readonly PhysicalTextLine[],
  seedIndex: number,
  groupCenter: number,
  candidates: ReadonlySet<PhysicalTextLine>,
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): boolean {
  const range = findCenteredGroupRange(
    lines,
    seedIndex,
    groupCenter,
    candidates,
  );
  const firstLine = lines[range.firstIndex]!;
  const lastLine = lines[range.lastIndex]!;
  const precedingLine = lines[range.firstIndex - 1];
  const followingLine = lines[range.lastIndex + 1];

  return ![precedingLine, followingLine].some(
    (line) =>
      line !== undefined &&
      (areVerticallyAdjacent(line, firstLine, 1.5) ||
        areVerticallyAdjacent(lastLine, line, 1.5)) &&
      matchesEstablishedContentGeometry(line, layout, coordinateTolerance),
  );
}

function isLocallySupportedCenteredPair(
  upper: PhysicalTextLine,
  lower: PhysicalTextLine,
  support: {
    readonly center: number;
    readonly upper: PhysicalTextLine;
    readonly lower: PhysicalTextLine;
  },
  coordinateTolerance: number,
): boolean {
  if (
    upper.pageIndex !== support.upper.pageIndex ||
    Math.abs((lineCenter(upper) + lineCenter(lower)) / 2 - support.center) >
      coordinateTolerance
  ) {
    return false;
  }

  const verticalDistance = Math.min(
    Math.abs(upper.bounds.y - support.upper.bounds.y),
    Math.abs(upper.bounds.y - support.lower.bounds.y),
    Math.abs(lower.bounds.y - support.upper.bounds.y),
    Math.abs(lower.bounds.y - support.lower.bounds.y),
  );
  const lineHeight = Math.max(
    upper.bounds.height,
    lower.bounds.height,
    support.upper.bounds.height,
    support.lower.bounds.height,
  );

  return verticalDistance <= lineHeight * 2.5;
}

function isCenteredPair(
  upper: PhysicalTextLine,
  lower: PhysicalTextLine,
  candidates: ReadonlySet<PhysicalTextLine>,
  coordinateTolerance: number,
): boolean {
  return (
    candidates.has(upper) &&
    candidates.has(lower) &&
    areVerticallyAdjacent(upper, lower, 1.5) &&
    Math.abs(lineCenter(upper) - lineCenter(lower)) <= coordinateTolerance &&
    Math.abs(upper.bounds.x - lower.bounds.x) > coordinateTolerance
  );
}

function addCenteredGroup(
  lines: readonly PhysicalTextLine[],
  seedIndex: number,
  groupCenter: number,
  candidates: ReadonlySet<PhysicalTextLine>,
  centeredLines: Set<PhysicalTextLine>,
): void {
  const range = findCenteredGroupRange(
    lines,
    seedIndex,
    groupCenter,
    candidates,
  );

  for (let index = range.firstIndex; index <= range.lastIndex; index += 1) {
    centeredLines.add(lines[index]!);
  }
}

function findCenteredGroupRange(
  lines: readonly PhysicalTextLine[],
  seedIndex: number,
  groupCenter: number,
  candidates: ReadonlySet<PhysicalTextLine>,
): { readonly firstIndex: number; readonly lastIndex: number } {
  let firstIndex = seedIndex;
  let lastIndex = seedIndex + 1;

  while (
    firstIndex > 0 &&
    belongsToCenteredGroup(
      lines[firstIndex - 1]!,
      lines[firstIndex]!,
      groupCenter,
      candidates,
    )
  ) {
    firstIndex -= 1;
  }

  while (
    lastIndex < lines.length - 1 &&
    belongsToCenteredGroup(
      lines[lastIndex]!,
      lines[lastIndex + 1]!,
      groupCenter,
      candidates,
    )
  ) {
    lastIndex += 1;
  }

  return { firstIndex, lastIndex };
}

function belongsToCenteredGroup(
  upper: PhysicalTextLine,
  lower: PhysicalTextLine,
  groupCenter: number,
  candidates: ReadonlySet<PhysicalTextLine>,
): boolean {
  return (
    candidates.has(upper) &&
    candidates.has(lower) &&
    areVerticallyAdjacent(upper, lower, 1.5) &&
    Math.abs(lineCenter(lower) - groupCenter) <= lower.bounds.height / 4
  );
}

function matchesEstablishedRoleGeometry(
  line: PhysicalTextLine,
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): boolean {
  const cueTolerance = Math.max(coordinateTolerance, line.bounds.height);

  return (
    matchesEstablishedCueGeometry(line, layout, cueTolerance) ||
    matchesEstablishedContentGeometry(line, layout, coordinateTolerance)
  );
}

function matchesEstablishedCueGeometry(
  line: PhysicalTextLine,
  layout: ScreenplayLayout,
  tolerance: number,
): boolean {
  const cueAnchors = [
    layout.characterCue,
    layout.dualDialogue?.left.characterCue,
    layout.dualDialogue?.right.characterCue,
  ];

  return cueAnchors.some(
    (anchor) =>
      anchor !== null &&
      anchor !== undefined &&
      Math.abs(line.bounds.x - anchor.x) <= tolerance,
  );
}

function matchesEstablishedContentGeometry(
  line: PhysicalTextLine,
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): boolean {
  const roleTolerance = Math.max(coordinateTolerance, line.bounds.height);
  const contentAnchors = [
    layout.dialogue,
    layout.parenthetical,
    layout.dualDialogue?.left.dialogue,
    layout.dualDialogue?.right.dialogue,
  ];

  if (
    contentAnchors.some(
      (anchor) =>
        anchor !== null &&
        anchor !== undefined &&
        Math.abs(line.bounds.x - anchor.x) <= roleTolerance,
    )
  ) {
    return true;
  }

  return (
    layout.transition !== null &&
    Math.abs(
      line.bounds.x + line.bounds.width - layout.transition.x,
    ) <= roleTolerance
  );
}

function hasBaselineSibling(
  line: PhysicalTextLine,
  lines: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): boolean {
  return lines.some(
    (candidate) =>
      candidate !== line &&
      candidate.pageIndex === line.pageIndex &&
      Math.abs(candidate.bounds.y - line.bounds.y) <= coordinateTolerance,
  );
}

function isIsolatedFromRoleGeometry(
  line: PhysicalTextLine,
  lines: readonly PhysicalTextLine[],
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): boolean {
  return !lines.some(
    (candidate) =>
      candidate !== line &&
      (areVerticallyAdjacent(candidate, line, 1.5) ||
        areVerticallyAdjacent(line, candidate, 1.5)) &&
      matchesEstablishedRoleGeometry(candidate, layout, coordinateTolerance),
  );
}

function isAtEstablishedScreenplayCenter(
  line: PhysicalTextLine,
  layout: ScreenplayLayout,
): boolean {
  if (layout.action === null) {
    return false;
  }

  const expectedCenters = [16.5, 18].map(
    (characterMeasure) =>
      layout.action!.x + line.bounds.height * characterMeasure,
  );

  return expectedCenters.some(
    (expectedCenter) =>
      Math.abs(lineCenter(line) - expectedCenter) <= line.bounds.height,
  );
}

function lineCenter(line: PhysicalTextLine): number {
  return line.bounds.x + line.bounds.width / 2;
}

function createTitleField(
  key: string,
  lines: readonly PhysicalTextLine[],
): TitlePageField {
  return { key, values: lines.map((line) => createStyledText([line])) };
}

function isSceneHeadingLine(
  line: PhysicalTextLine,
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): boolean {
  if (
    layout.action === null ||
    Math.abs(line.bounds.x - layout.action.x) > coordinateTolerance
  ) {
    return false;
  }

  const trimmedText = line.text.trim();

  return (
    conventionalSceneHeading.test(trimmedText) ||
    (isUppercaseText(trimmedText) &&
      line.spans.length > 0 &&
      line.spans.every((span) => span.style.bold))
  );
}

function collectCenteredActionLines(options: {
  readonly lines: readonly PhysicalTextLine[];
  readonly startIndex: number;
  readonly blockedLines: ReadonlySet<PhysicalTextLine>;
  readonly centeredActionLines: ReadonlySet<PhysicalTextLine>;
}): ActionLineGroup {
  const actionLines = [options.lines[options.startIndex]!];
  const lineJoins: LineJoin[] = [];
  let nextIndex = options.startIndex + 1;

  while (nextIndex < options.lines.length) {
    const previousLine = actionLines.at(-1)!;
    const nextLine = options.lines[nextIndex]!;

    if (
      options.blockedLines.has(nextLine) ||
      !options.centeredActionLines.has(nextLine) ||
      !areVerticallyAdjacent(previousLine, nextLine, 1.5)
    ) {
      break;
    }

    lineJoins.push("newline");
    actionLines.push(nextLine);
    nextIndex += 1;
  }

  return { lines: actionLines, lineJoins, nextIndex };
}

function shouldPreserveActionLineBreak(
  previousLine: PhysicalTextLine,
  line: PhysicalTextLine,
  actionLineMeasure: number | null,
): boolean {
  if (actionLineMeasure === null) {
    return false;
  }

  const visibleShortfall =
    Math.min(previousLine.bounds.height, line.bounds.height) * 5;

  return (
    previousLine.bounds.width + visibleShortfall < actionLineMeasure &&
    line.bounds.width + visibleShortfall < actionLineMeasure
  );
}

function haveMatchingActionOrigins(
  left: PhysicalTextLine,
  right: PhysicalTextLine,
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): boolean {
  const expectedX = layout.action?.x ?? left.bounds.x;

  return (
    Math.abs(left.bounds.x - expectedX) <= coordinateTolerance &&
    Math.abs(right.bounds.x - expectedX) <= coordinateTolerance
  );
}

function continuesActionParagraph(
  previousLine: PhysicalTextLine,
  line: PhysicalTextLine,
  actionLineMeasure: number | null,
): boolean {
  if (previousLine.pageIndex === line.pageIndex) {
    return areVerticallyAdjacent(previousLine, line, 1.5);
  }

  if (line.pageIndex !== previousLine.pageIndex + 1) {
    return false;
  }

  if (actionLineMeasure === null) {
    return false;
  }

  const visibleShortfall = previousLine.bounds.height * 5;
  const reachesActionMeasure =
    previousLine.bounds.width + visibleShortfall >= actionLineMeasure;
  const previousText = previousLine.text.trimEnd();
  const lineText = line.text.trimStart();
  const hasPairedDashContinuation =
    /[-–—]$/u.test(previousText) && /^[-–—]/u.test(lineText);
  const hasContinuationEnding =
    !/[.!?…]["'’”)\]]?$/u.test(previousText);

  return (
    hasPairedDashContinuation ||
    (reachesActionMeasure && hasContinuationEnding)
  );
}

function haveMatchingCenters(
  left: PhysicalTextLine,
  right: PhysicalTextLine,
  coordinateTolerance: number,
): boolean {
  const tolerance = Math.max(
    coordinateTolerance,
    Math.min(left.bounds.height, right.bounds.height) / 2,
  );

  return Math.abs(lineCenter(left) - lineCenter(right)) <= tolerance;
}

function verticalGapInLineHeights(
  upper: PhysicalTextLine,
  lower: PhysicalTextLine,
): number {
  const height = Math.max(upper.bounds.height, lower.bounds.height);

  return (upper.bounds.y - lower.bounds.y) / height;
}

function areVerticallyAdjacent(
  upper: PhysicalTextLine,
  lower: PhysicalTextLine,
  heightMultiplier: number,
): boolean {
  if (upper.pageIndex !== lower.pageIndex) {
    return false;
  }

  const verticalGap = upper.bounds.y - lower.bounds.y;
  const height = Math.max(upper.bounds.height, lower.bounds.height);

  return verticalGap > 0 && verticalGap <= height * heightMultiplier;
}
