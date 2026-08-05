import type { PhysicalTextLine } from "../physical-lines.js";
import { clusterCoordinates, median } from "./coordinate-evidence.js";

export interface DualDialogueOccurrence {
  readonly leftCharacterCue: PhysicalTextLine;
  readonly leftDialogue: PhysicalTextLine;
  readonly rightCharacterCue: PhysicalTextLine;
  readonly rightDialogue: PhysicalTextLine;
  readonly leftContent: readonly DialogueContentOccurrence[];
  readonly rightContent: readonly DialogueContentOccurrence[];
  readonly parentheticals: readonly PhysicalTextLine[];
  readonly lines: readonly PhysicalTextLine[];
}

export interface DialogueContentOccurrence {
  readonly type: "parenthetical" | "dialogue";
  readonly lines: readonly PhysicalTextLine[];
}

export interface DialogueOccurrence {
  readonly characterCue: PhysicalTextLine;
  readonly content: readonly DialogueContentOccurrence[];
  readonly dialogueLines: readonly PhysicalTextLine[];
  readonly parentheticals: readonly PhysicalTextLine[];
}

export interface ScreenplaySequences {
  readonly transitionLines: readonly PhysicalTextLine[];
  readonly dualDialogueOccurrences: readonly DualDialogueOccurrence[];
  readonly dialogueOccurrences: readonly DialogueOccurrence[];
  readonly reservedLines: ReadonlySet<PhysicalTextLine>;
}

export function findScreenplaySequences(
  lines: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): ScreenplaySequences {
  const reservedLines = new Set<PhysicalTextLine>();
  const dualDialogueOccurrences = findDualDialogueOccurrences(
    lines,
    coordinateTolerance,
  );

  for (const occurrence of dualDialogueOccurrences) {
    for (const line of occurrence.lines) {
      reservedLines.add(line);
    }
  }

  const dialogueCandidates = findDialogueOccurrences(
    lines,
    reservedLines,
    coordinateTolerance,
  );
  const repeatedTransitionCandidates = findRepeatedTransitionLines(
    lines,
    reservedLines,
    coordinateTolerance,
  );
  const repeatedTransitionLines = resolveRepeatedTransitionLines(
    lines,
    repeatedTransitionCandidates,
    dialogueCandidates,
    coordinateTolerance,
  );
  const contextualTransitionLines = findContextualTransitionCandidates(
    lines,
    reservedLines,
    dialogueCandidates,
    repeatedTransitionLines,
  );
  const arbitratedTransitionLines = [
    ...new Set([...repeatedTransitionLines, ...contextualTransitionLines]),
  ];
  const arbitratedTransitionSet = new Set(arbitratedTransitionLines);
  const dialogueOccurrences = dialogueCandidates.filter(
    (occurrence) => !arbitratedTransitionSet.has(occurrence.characterCue),
  );

  for (const line of arbitratedTransitionLines) {
    reservedLines.add(line);
  }

  for (const occurrence of dialogueOccurrences) {
    reservedLines.add(occurrence.characterCue);

    for (const line of occurrence.dialogueLines) {
      reservedLines.add(line);
    }

    for (const line of occurrence.parentheticals) {
      reservedLines.add(line);
    }
  }

  const transitionLines = findTransitionLines(
    lines,
    reservedLines,
    arbitratedTransitionLines,
    dialogueOccurrences,
    coordinateTolerance,
  );

  for (const line of transitionLines) {
    reservedLines.add(line);
  }

  return {
    transitionLines,
    dualDialogueOccurrences,
    dialogueOccurrences,
    reservedLines,
  };
}

function findContextualTransitionCandidates(
  lines: readonly PhysicalTextLine[],
  reservedLines: ReadonlySet<PhysicalTextLine>,
  dialogueCandidates: readonly DialogueOccurrence[],
  repeatedTransitionLines: readonly PhysicalTextLine[],
): readonly PhysicalTextLine[] {
  if (dialogueCandidates.length < 2 || repeatedTransitionLines.length > 0) {
    return [];
  }

  const characterCueX = median(
    dialogueCandidates.map((occurrence) => occurrence.characterCue.bounds.x),
  );
  const dialogueX = median(
    dialogueCandidates.flatMap((occurrence) =>
      occurrence.dialogueLines.map((line) => line.bounds.x),
    ),
  );
  const typicalLineHeight = median(lines.map((line) => line.bounds.height));
  const cueToDialogueIndent = characterCueX - dialogueX;
  const rightSideThreshold =
    characterCueX + Math.max(typicalLineHeight * 2, cueToDialogueIndent);
  const lineIndexes = new Map(
    lines.map((line, index) => [line, index] as const),
  );

  return lines.filter((line) => {
    if (
      reservedLines.has(line) ||
      !isUppercaseText(line.text) ||
      line.bounds.x <= rightSideThreshold
    ) {
      return false;
    }

    const nextLine = lines[lineIndexes.get(line)! + 1];

    return (
      nextLine !== undefined &&
      nextLine.pageIndex === line.pageIndex &&
      isVerticallyAdjacent(line, nextLine, 2) &&
      nextLine.bounds.x < line.bounds.x - line.bounds.height
    );
  });
}

function findTransitionLines(
  lines: readonly PhysicalTextLine[],
  reservedLines: ReadonlySet<PhysicalTextLine>,
  repeatedTransitionLines: readonly PhysicalTextLine[],
  dialogueOccurrences: readonly DialogueOccurrence[],
  coordinateTolerance: number,
): readonly PhysicalTextLine[] {
  if (lines.length === 0) {
    return [];
  }

  const pages = Map.groupBy(lines, (line) => line.pageIndex);
  const pageLeftEdges = [...pages.values()].map((pageLines) =>
    Math.min(...pageLines.map((line) => line.bounds.x)),
  );
  const pageRightEdges = [...pages.values()].map((pageLines) =>
    Math.max(...pageLines.map((line) => line.bounds.x + line.bounds.width)),
  );
  const documentLeftEdge = median(pageLeftEdges);
  const documentRightEdge = median(pageRightEdges);
  const documentMidpoint = (documentLeftEdge + documentRightEdge) / 2;
  const rightSideThreshold = inferRightSideThreshold(
    lines,
    dialogueOccurrences,
    documentMidpoint,
  );
  const geometricCandidates = lines.filter((line) => {
    const rightEdge = line.bounds.x + line.bounds.width;

    return (
      !reservedLines.has(line) &&
      isUppercaseText(line.text) &&
      line.bounds.x > rightSideThreshold &&
      Math.abs(rightEdge - documentRightEdge) <= line.bounds.height
    );
  });
  const rightEdgeClusters = clusterCoordinates(
    geometricCandidates.map((line) => line.bounds.x + line.bounds.width),
    coordinateTolerance,
  );
  const lineIndexes = new Map(
    lines.map((line, index) => [line, index] as const),
  );

  const contextualTransitionLines = geometricCandidates.filter((line) => {
    const lineIndex = lineIndexes.get(line)!;
    const nextLine = lines[lineIndex + 1];
    const hasLeftwardFollowingLine =
      nextLine !== undefined &&
      nextLine.pageIndex === line.pageIndex &&
      isVerticallyAdjacent(line, nextLine, 3) &&
      nextLine.bounds.x < line.bounds.x - line.bounds.height;
    const rightEdge = line.bounds.x + line.bounds.width;
    const hasRepeatedRightEdge = rightEdgeClusters.some(
      (cluster) =>
        cluster.values.length > 1 &&
        cluster.values.some(
          (coordinate) =>
            Math.abs(coordinate - rightEdge) <= coordinateTolerance,
        ),
    );

    return hasLeftwardFollowingLine || hasRepeatedRightEdge;
  });

  return [...new Set([...repeatedTransitionLines, ...contextualTransitionLines])];
}

function findRepeatedTransitionLines(
  lines: readonly PhysicalTextLine[],
  reservedLines: ReadonlySet<PhysicalTextLine>,
  coordinateTolerance: number,
): readonly PhysicalTextLine[] {
  if (lines.length === 0) {
    return [];
  }

  const typicalLeftEdge = median(lines.map((line) => line.bounds.x));
  const typicalRightEdge = median(
    lines.map((line) => line.bounds.x + line.bounds.width),
  );
  const contentMidpoint = (typicalLeftEdge + typicalRightEdge) / 2;
  const candidates = lines.filter(
    (line) =>
      !reservedLines.has(line) &&
      isUppercaseText(line.text) &&
      line.bounds.x > contentMidpoint,
  );
  return filterRepeatedRightEdgeLines(candidates, coordinateTolerance);
}

function filterRepeatedRightEdgeLines(
  candidates: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): readonly PhysicalTextLine[] {
  const rightEdgeClusters = clusterCoordinates(
    candidates.map((line) => line.bounds.x + line.bounds.width),
    coordinateTolerance,
  );

  return candidates.filter((line) => {
    const rightEdge = line.bounds.x + line.bounds.width;
    const matchingCluster = rightEdgeClusters.find((cluster) =>
      cluster.values.some(
        (coordinate) => Math.abs(coordinate - rightEdge) <= coordinateTolerance,
      ),
    );

    if (matchingCluster === undefined || matchingCluster.values.length < 2) {
      return false;
    }

    const matchingCandidates = candidates.filter((candidate) =>
      matchingCluster.values.some(
        (coordinate) =>
          Math.abs(
            coordinate - (candidate.bounds.x + candidate.bounds.width),
          ) <= coordinateTolerance,
      ),
    );

    return (
      clusterCoordinates(
        matchingCandidates.map((candidate) => candidate.bounds.x),
        coordinateTolerance,
      ).length > 1
    );
  });
}

function resolveRepeatedTransitionLines(
  lines: readonly PhysicalTextLine[],
  transitionCandidates: readonly PhysicalTextLine[],
  dialogueCandidates: readonly DialogueOccurrence[],
  coordinateTolerance: number,
): readonly PhysicalTextLine[] {
  const transitionCandidateSet = new Set(transitionCandidates);
  const unambiguousDialogueOccurrences = dialogueCandidates.filter(
    (occurrence) => !transitionCandidateSet.has(occurrence.characterCue),
  );

  if (unambiguousDialogueOccurrences.length === 0) {
    return transitionCandidates;
  }

  const characterCueX = median(
    unambiguousDialogueOccurrences.map(
      (occurrence) => occurrence.characterCue.bounds.x,
    ),
  );
  const typicalLineHeight = median(lines.map((line) => line.bounds.height));
  const rightSideThreshold = characterCueX + typicalLineHeight;

  return filterRepeatedRightEdgeLines(
    transitionCandidates.filter((line) => line.bounds.x > rightSideThreshold),
    coordinateTolerance,
  );
}

function inferRightSideThreshold(
  lines: readonly PhysicalTextLine[],
  dialogueOccurrences: readonly DialogueOccurrence[],
  contentMidpoint: number,
): number {
  if (dialogueOccurrences.length === 0) {
    return contentMidpoint;
  }

  const characterCueX = median(
    dialogueOccurrences.map((occurrence) => occurrence.characterCue.bounds.x),
  );
  const typicalLineHeight = median(lines.map((line) => line.bounds.height));

  return Math.max(contentMidpoint, characterCueX + typicalLineHeight);
}

function findDualDialogueOccurrences(
  lines: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): readonly DualDialogueOccurrence[] {
  const occurrences: DualDialogueOccurrence[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const parsedOccurrence = parseDualDialogueOccurrence(
      lines,
      index,
      coordinateTolerance,
    );

    if (parsedOccurrence === null) {
      continue;
    }

    occurrences.push(parsedOccurrence.occurrence);
    index = parsedOccurrence.nextIndex - 1;
  }

  return occurrences;
}

function parseDualDialogueOccurrence(
  lines: readonly PhysicalTextLine[],
  cueIndex: number,
  coordinateTolerance: number,
): {
  readonly occurrence: DualDialogueOccurrence;
  readonly nextIndex: number;
} | null {
  const leftCharacterCue = lines[cueIndex]!;
  const rightCharacterCue = lines[cueIndex + 1]!;

  if (
    !isCueUppercaseText(leftCharacterCue.text) ||
    !isCueUppercaseText(rightCharacterCue.text) ||
    isCueParentheticalFragment(leftCharacterCue.text) ||
    isCueParentheticalFragment(rightCharacterCue.text) ||
    leftCharacterCue.pageIndex !== rightCharacterCue.pageIndex ||
    !shareBaseline(leftCharacterCue, rightCharacterCue, coordinateTolerance) ||
    leftCharacterCue.bounds.x >= rightCharacterCue.bounds.x
  ) {
    return null;
  }

  const laneBoundary =
    (leftCharacterCue.bounds.x + rightCharacterCue.bounds.x) / 2;
  const occurrenceLines: PhysicalTextLine[] = [
    leftCharacterCue,
    rightCharacterCue,
  ];
  const parentheticals: PhysicalTextLine[] = [];
  let leftDialogue: PhysicalTextLine | undefined;
  let rightDialogue: PhysicalTextLine | undefined;
  let previousBaseline = leftCharacterCue;
  let nextIndex = cueIndex + 2;

  while (nextIndex < lines.length) {
    const row = readBaselineRow(lines, nextIndex, coordinateTolerance);

    if (
      row.lines[0]!.pageIndex !== leftCharacterCue.pageIndex ||
      !isVerticallyAdjacent(previousBaseline, row.lines[0]!, 1.5)
    ) {
      break;
    }

    occurrenceLines.push(...row.lines);

    for (const line of row.lines) {
      if (isParentheticalFragment(line.text)) {
        if (isParenthetical(line.text)) {
          parentheticals.push(line);
        }

        continue;
      }

      if (line.bounds.x < laneBoundary && leftDialogue === undefined) {
        leftDialogue = line;
      }

      if (line.bounds.x > laneBoundary && rightDialogue === undefined) {
        rightDialogue = line;
      }
    }

    previousBaseline = row.lines[0]!;
    nextIndex = row.nextIndex;

    if (leftDialogue !== undefined && rightDialogue !== undefined) {
      break;
    }
  }

  if (
    leftDialogue === undefined ||
    rightDialogue === undefined ||
    leftDialogue.bounds.x >= leftCharacterCue.bounds.x ||
    rightDialogue.bounds.x <= leftCharacterCue.bounds.x ||
    rightDialogue.bounds.x >= rightCharacterCue.bounds.x
  ) {
    return null;
  }

  while (nextIndex < lines.length) {
    const row = readBaselineRow(lines, nextIndex, coordinateTolerance);

    if (
      row.lines[0]!.pageIndex !== leftCharacterCue.pageIndex ||
      !isVerticallyAdjacent(previousBaseline, row.lines[0]!, 1.5) ||
      !row.lines.every((line) =>
        belongsToDualDialogueLane(
          line,
          leftDialogue,
          rightDialogue,
          laneBoundary,
          coordinateTolerance,
        ),
      )
    ) {
      break;
    }

    occurrenceLines.push(...row.lines);
    parentheticals.push(
      ...row.lines.filter((line) => isParenthetical(line.text)),
    );
    previousBaseline = row.lines[0]!;
    nextIndex = row.nextIndex;
  }

  return {
    occurrence: {
      leftCharacterCue,
      leftDialogue,
      rightCharacterCue,
      rightDialogue,
      leftContent: groupDialogueContent(
        occurrenceLines
          .slice(2)
          .filter((line) => line.bounds.x < laneBoundary),
      ),
      rightContent: groupDialogueContent(
        occurrenceLines
          .slice(2)
          .filter((line) => line.bounds.x > laneBoundary),
      ),
      parentheticals,
      lines: occurrenceLines,
    },
    nextIndex,
  };
}

function readBaselineRow(
  lines: readonly PhysicalTextLine[],
  startIndex: number,
  coordinateTolerance: number,
): { readonly lines: readonly PhysicalTextLine[]; readonly nextIndex: number } {
  const firstLine = lines[startIndex]!;
  const rowLines: PhysicalTextLine[] = [firstLine];
  let nextIndex = startIndex + 1;

  while (
    nextIndex < lines.length &&
    lines[nextIndex]!.pageIndex === firstLine.pageIndex &&
    shareBaseline(firstLine, lines[nextIndex]!, coordinateTolerance)
  ) {
    rowLines.push(lines[nextIndex]!);
    nextIndex += 1;
  }

  return { lines: rowLines, nextIndex };
}

function belongsToDualDialogueLane(
  line: PhysicalTextLine,
  leftDialogue: PhysicalTextLine,
  rightDialogue: PhysicalTextLine,
  laneBoundary: number,
  coordinateTolerance: number,
): boolean {
  if (isParentheticalFragment(line.text)) {
    return true;
  }

  const expectedX =
    line.bounds.x < laneBoundary
      ? leftDialogue.bounds.x
      : rightDialogue.bounds.x;

  return Math.abs(line.bounds.x - expectedX) <= coordinateTolerance;
}

function findDialogueOccurrences(
  lines: readonly PhysicalTextLine[],
  reservedLines: ReadonlySet<PhysicalTextLine>,
  coordinateTolerance: number,
): readonly DialogueOccurrence[] {
  const occurrences: DialogueOccurrence[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const characterCue = lines[index]!;

    if (
      reservedLines.has(characterCue) ||
      isCueParentheticalFragment(characterCue.text)
    ) {
      continue;
    }

    let dialogueIndex = index + 1;
    const contentLines: PhysicalTextLine[] = [];
    let previousContentLine = characterCue;
    let parentheticalOpen = false;

    while (dialogueIndex < lines.length) {
      const possibleParenthetical = lines[dialogueIndex]!;
      const continuesParenthetical =
        parentheticalOpen ||
        possibleParenthetical.text.trimStart().startsWith("(");

      if (
        !continuesParenthetical ||
        reservedLines.has(possibleParenthetical) ||
        possibleParenthetical.pageIndex !== characterCue.pageIndex ||
        !isVerticallyAdjacent(previousContentLine, possibleParenthetical, 1.5) ||
        possibleParenthetical.bounds.x >= characterCue.bounds.x
      ) {
        break;
      }

      contentLines.push(possibleParenthetical);
      parentheticalOpen = !possibleParenthetical.text.trimEnd().endsWith(")");
      previousContentLine = possibleParenthetical;
      dialogueIndex += 1;
    }

    if (parentheticalOpen) {
      continue;
    }

    const firstDialogueLine = lines[dialogueIndex];
    const precedingLine = lines[dialogueIndex - 1]!;

    if (
      firstDialogueLine === undefined ||
      reservedLines.has(firstDialogueLine) ||
      firstDialogueLine.pageIndex !== characterCue.pageIndex ||
      !isVerticallyAdjacent(precedingLine, firstDialogueLine, 1.5) ||
      characterCue.bounds.x - firstDialogueLine.bounds.x <=
        characterCue.bounds.height ||
      (!isCueUppercaseText(characterCue.text) &&
        characterCue.bounds.width >= firstDialogueLine.bounds.width)
    ) {
      continue;
    }

    const dialogueLines: PhysicalTextLine[] = [firstDialogueLine];
    contentLines.push(firstDialogueLine);
    let previousLine = firstDialogueLine;
    let continuationIndex = dialogueIndex + 1;
    parentheticalOpen = false;

    while (continuationIndex < lines.length) {
      const continuation = lines[continuationIndex]!;

      if (reservedLines.has(continuation)) {
        break;
      }

      const continuesParenthetical =
        parentheticalOpen || continuation.text.trimStart().startsWith("(");

      if (
        continuesParenthetical &&
        continuation.pageIndex === previousLine.pageIndex &&
        isVerticallyAdjacent(previousLine, continuation, 1.5) &&
        continuation.bounds.x > firstDialogueLine.bounds.x &&
        continuation.bounds.x < characterCue.bounds.x
      ) {
        contentLines.push(continuation);
        parentheticalOpen = !continuation.text.trimEnd().endsWith(")");
        previousLine = continuation;
        continuationIndex += 1;
        continue;
      }

      const continuesAcrossPage =
        continuation.pageIndex === previousLine.pageIndex + 1;
      const continuesOnPage = isVerticallyAdjacent(
        previousLine,
        continuation,
        1.5,
      );

      if (
        Math.abs(continuation.bounds.x - firstDialogueLine.bounds.x) >
          coordinateTolerance ||
        (!continuesAcrossPage && !continuesOnPage)
      ) {
        break;
      }

      dialogueLines.push(continuation);
      contentLines.push(continuation);
      previousLine = continuation;
      continuationIndex += 1;
    }

    const content = groupDialogueContent(contentLines);
    occurrences.push({
      characterCue,
      content,
      dialogueLines,
      parentheticals: content
        .filter((item) => item.type === "parenthetical")
        .flatMap((item) => item.lines),
    });
    index = continuationIndex - 1;
  }

  return occurrences;
}

function groupDialogueContent(
  lines: readonly PhysicalTextLine[],
): readonly DialogueContentOccurrence[] {
  const groups: Array<{
    readonly type: DialogueContentOccurrence["type"];
    readonly lines: PhysicalTextLine[];
  }> = [];
  let parentheticalOpen = false;

  for (const line of lines) {
    const type: DialogueContentOccurrence["type"] =
      parentheticalOpen || line.text.trimStart().startsWith("(")
        ? "parenthetical"
        : "dialogue";
    const currentGroup = groups.at(-1);

    if (currentGroup !== undefined && currentGroup.type === type) {
      currentGroup.lines.push(line);
    } else {
      groups.push({ type, lines: [line] });
    }

    parentheticalOpen =
      type === "parenthetical" && !line.text.trimEnd().endsWith(")");
  }

  return groups;
}

export function isUppercaseText(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];

  return (
    letters.length >= 2 &&
    letters.every((letter) => letter === letter.toLocaleUpperCase())
  );
}

function isCueUppercaseText(text: string): boolean {
  return isUppercaseText(removeTrailingParenthesizedGroups(text));
}

function removeTrailingParenthesizedGroups(text: string): string {
  let prefixEnd = text.trimEnd().length;

  while (prefixEnd > 0 && text[prefixEnd - 1] === ")") {
    let depth = 0;
    let openingIndex = -1;

    for (let index = prefixEnd - 1; index >= 0; index -= 1) {
      if (text[index] === ")") {
        depth += 1;
      } else if (text[index] === "(") {
        depth -= 1;

        if (depth === 0) {
          openingIndex = index;
          break;
        }
      }
    }

    if (openingIndex < 0) {
      break;
    }

    prefixEnd = text.slice(0, openingIndex).trimEnd().length;
  }

  return text.slice(0, prefixEnd);
}

function isParenthetical(text: string): boolean {
  const trimmedText = text.trim();

  return trimmedText.startsWith("(") && trimmedText.endsWith(")");
}

function isParentheticalFragment(text: string): boolean {
  const trimmedText = text.trim();

  return trimmedText.startsWith("(") || trimmedText.endsWith(")");
}

function isCueParentheticalFragment(text: string): boolean {
  const trimmedText = text.trim();

  return (
    trimmedText.startsWith("(") ||
    (trimmedText.endsWith(")") && !trimmedText.includes("("))
  );
}

function shareBaseline(
  left: PhysicalTextLine,
  right: PhysicalTextLine,
  coordinateTolerance: number,
): boolean {
  return Math.abs(left.bounds.y - right.bounds.y) <= coordinateTolerance;
}

function isVerticallyAdjacent(
  upper: PhysicalTextLine,
  lower: PhysicalTextLine,
  heightMultiplier: number,
): boolean {
  if (upper.pageIndex !== lower.pageIndex) {
    return false;
  }

  const verticalGap = upper.bounds.y - lower.bounds.y;
  const localHeight = Math.max(upper.bounds.height, lower.bounds.height);

  return verticalGap > 0 && verticalGap <= localHeight * heightMultiplier;
}
