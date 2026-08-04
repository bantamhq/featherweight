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
  readonly numberFragments: readonly PhysicalTextLine[];
  readonly sceneNumber: string | null;
}

export interface ActionLineGroup {
  readonly lines: readonly PhysicalTextLine[];
  readonly lineJoins: readonly LineJoin[];
  readonly nextIndex: number;
}

const conventionalSceneHeading = /^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/u;

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
  const firstPageLines = lines.filter((line) => line.pageIndex === firstPageIndex);
  const bodyLines = lines.filter((line) => line.pageIndex !== firstPageIndex);
  const isSeparateTitlePage =
    firstPageLines.length >= 6 &&
    bodyLines.length > 0 &&
    firstPageLines.every(
      (line) => Math.abs(line.bounds.x - actionX) > coordinateTolerance,
    ) &&
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
  let titleValueCount = 1;

  while (
    titleValueCount < lines.length &&
    areVerticallyAdjacent(
      lines[titleValueCount - 1]!,
      lines[titleValueCount]!,
      1.5,
    ) &&
    haveMatchingCenters(
      lines[titleValueCount - 1]!,
      lines[titleValueCount]!,
      coordinateTolerance,
    )
  ) {
    titleValueCount += 1;
  }

  const titleValues = lines.slice(0, titleValueCount);
  const remainingLines = lines.slice(titleValueCount);

  if (remainingLines.length < 5) {
    return null;
  }

  const credit = remainingLines[0]!;
  const author = remainingLines[1]!;
  const source = remainingLines[2]!;
  const draftDate = remainingLines[3]!;
  const contact = remainingLines.slice(4);
  const centeredUpperLines = [...titleValues, credit, author, source];
  const hasConventionalUpperGeometry =
    centeredUpperLines.every((line) =>
      haveMatchingCenters(
        centeredUpperLines[0]!,
        line,
        coordinateTolerance,
      ),
    ) &&
    hasRelativeVerticalGap(titleValues.at(-1)!, credit, 3) &&
    hasRelativeVerticalGap(credit, author, 2) &&
    hasOneOfRelativeVerticalGaps(author, source, [3, 5]);
  const footerLines = [draftDate, ...contact];
  const footerOriginTolerance = Math.max(
    coordinateTolerance,
    draftDate.bounds.height / 2,
  );
  const hasConventionalFooterGeometry =
    footerLines.every(
      (line) =>
        Math.abs(line.bounds.x - draftDate.bounds.x) <=
        footerOriginTolerance,
    ) &&
    verticalGapInLineHeights(draftDate, contact[0]!) >= 0.75 &&
    verticalGapInLineHeights(draftDate, contact[0]!) <= 2.5 &&
    contact.slice(1).every((line, index) =>
      areVerticallyAdjacent(contact[index]!, line, 1.5),
    );

  if (!hasConventionalUpperGeometry || !hasConventionalFooterGeometry) {
    return null;
  }

  return [
    createTitleField("Title", titleValues),
    createTitleField("Credit", [credit]),
    createTitleField("Author", [author]),
    createTitleField("Source", [source]),
    createTitleField("Draft date", [draftDate]),
    createTitleField("Contact", contact),
  ];
}

export function findSceneHeadings(
  lines: readonly PhysicalTextLine[],
  reservedLines: ReadonlySet<PhysicalTextLine>,
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): readonly SceneHeadingEvidence[] {
  const headings: SceneHeadingEvidence[] = [];

  for (const heading of lines) {
    if (
      reservedLines.has(heading) ||
      !isSceneHeadingLine(heading, layout, coordinateTolerance)
    ) {
      continue;
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
    text: createStyledText([evidence.heading]),
    sceneNumber: evidence.sceneNumber,
  };
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

  const expectedCenter = layout.action.x + line.bounds.height * 16.5;

  return Math.abs(lineCenter(line) - expectedCenter) <= line.bounds.height;
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

function hasRelativeVerticalGap(
  upper: PhysicalTextLine,
  lower: PhysicalTextLine,
  expectedLineHeights: number,
): boolean {
  return (
    Math.abs(verticalGapInLineHeights(upper, lower) - expectedLineHeights) <=
    0.5
  );
}

function hasOneOfRelativeVerticalGaps(
  upper: PhysicalTextLine,
  lower: PhysicalTextLine,
  expectedLineHeights: readonly number[],
): boolean {
  return expectedLineHeights.some((expected) =>
    hasRelativeVerticalGap(upper, lower, expected),
  );
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
