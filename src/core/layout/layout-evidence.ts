import type { NormalizedText } from "../normalized-text.js";
import type { PhysicalTextLine } from "../physical-lines.js";
import {
  clusterCoordinates,
  inferCoordinateTolerance,
  resolveCoordinateEvidence,
  resolvePageSupportedCoordinateEvidence,
  type CoordinateEvidence,
} from "./coordinate-evidence.js";
import {
  findScreenplaySequences,
  isUppercaseText,
  type DualDialogueOccurrence,
} from "./screenplay-sequences.js";

export interface DualDialogueEvidence {
  readonly leftCharacterCue: CoordinateEvidence;
  readonly leftDialogue: CoordinateEvidence;
  readonly rightCharacterCue: CoordinateEvidence;
  readonly rightDialogue: CoordinateEvidence;
}

export interface ScreenplayLayoutEvidence {
  readonly action: CoordinateEvidence;
  readonly characterCue: CoordinateEvidence;
  readonly dialogue: CoordinateEvidence;
  readonly parenthetical: CoordinateEvidence;
  readonly transition: CoordinateEvidence;
  readonly dualDialogue: DualDialogueEvidence | null;
}

export function inferLayoutEvidence(
  normalizedText: NormalizedText,
): ScreenplayLayoutEvidence {
  const lines = normalizedText.pages.flatMap((page) => page.lines);
  const coordinateTolerance = inferCoordinateTolerance(lines);
  const sequences = findScreenplaySequences(lines, coordinateTolerance);
  const actionLines = lines.filter(
    (line) => !sequences.reservedLines.has(line),
  );
  const bodyActionLines = retainBodyActionEvidence(
    actionLines,
    coordinateTolerance,
  );
  const parentheticalLines = [
    ...sequences.dialogueOccurrences.flatMap(
      (occurrence) => occurrence.parentheticals,
    ),
    ...sequences.dualDialogueOccurrences.flatMap(
      (occurrence) => occurrence.parentheticals,
    ),
  ];

  return {
    action: resolvePageSupportedCoordinateEvidence(
      bodyActionLines.map((line) => ({
        x: line.bounds.x,
        pageIndex: line.pageIndex,
      })),
      coordinateTolerance,
    ),
    characterCue: resolveCoordinateEvidence(
      sequences.dialogueOccurrences.map(
        (occurrence) => occurrence.characterCue.bounds.x,
      ),
      coordinateTolerance,
    ),
    dialogue: resolveCoordinateEvidence(
      sequences.dialogueOccurrences.flatMap((occurrence) =>
        occurrence.dialogueLines.map((line) => line.bounds.x),
      ),
      coordinateTolerance,
    ),
    parenthetical: resolveParentheticalEvidence(
      parentheticalLines,
      coordinateTolerance,
    ),
    transition: resolveCoordinateEvidence(
      sequences.transitionLines.map(
        (line) => line.bounds.x + line.bounds.width,
      ),
      coordinateTolerance,
    ),
    dualDialogue: inferDualDialogueEvidence(
      sequences.dualDialogueOccurrences,
      coordinateTolerance,
    ),
  };
}

function retainBodyActionEvidence(
  lines: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): readonly PhysicalTextLine[] {
  if (lines.length === 0) {
    return lines;
  }

  const earliestPageIndex = Math.min(...lines.map((line) => line.pageIndex));
  const firstPageLines = lines.filter(
    (line) => line.pageIndex === earliestPageIndex,
  );
  const laterPageLines = lines.filter(
    (line) => line.pageIndex !== earliestPageIndex,
  );

  if (
    laterPageLines.length === 0 ||
    !firstPageLines.every((line) => isUppercaseText(line.text))
  ) {
    return lines;
  }

  const firstPageClusters = clusterCoordinates(
    firstPageLines.map((line) => line.bounds.x),
    coordinateTolerance,
  );

  if (firstPageClusters.length !== 1) {
    return lines;
  }

  const firstPageOrigin =
    firstPageClusters[0]!.values.reduce((sum, x) => sum + x, 0) /
    firstPageClusters[0]!.values.length;
  const originContinuesLater = laterPageLines.some(
    (line) =>
      Math.abs(line.bounds.x - firstPageOrigin) <= coordinateTolerance,
  );

  return originContinuesLater ? lines : laterPageLines;
}

function resolveParentheticalEvidence(
  lines: readonly PhysicalTextLine[],
  coordinateTolerance: number,
): CoordinateEvidence {
  const leftEdgeEvidence = resolveCoordinateEvidence(
    lines.map((line) => line.bounds.x),
    coordinateTolerance,
  );

  if (lines.length < 3) {
    return leftEdgeEvidence;
  }

  const leftEdgeClusters = clusterCoordinates(
    lines.map((line) => line.bounds.x),
    coordinateTolerance,
  );
  const centerClusters = [
    ...clusterCoordinates(
      lines.map((line) => line.bounds.x + line.bounds.width / 2),
      coordinateTolerance,
    ),
  ].sort((left, right) => right.values.length - left.values.length);
  const dominantCenterCluster = centerClusters[0]!;
  const stableCenter =
    dominantCenterCluster.values.length / lines.length >= 0.8;

  if (stableCenter && leftEdgeClusters.length > 1) {
    return { x: null, conflicting: true };
  }

  return leftEdgeEvidence;
}

function inferDualDialogueEvidence(
  occurrences: readonly DualDialogueOccurrence[],
  coordinateTolerance: number,
): DualDialogueEvidence | null {
  if (occurrences.length === 0) {
    return null;
  }

  return {
    leftCharacterCue: resolveCoordinateEvidence(
      occurrences.map((occurrence) => occurrence.leftCharacterCue.bounds.x),
      coordinateTolerance,
    ),
    leftDialogue: resolveCoordinateEvidence(
      occurrences.map((occurrence) => occurrence.leftDialogue.bounds.x),
      coordinateTolerance,
    ),
    rightCharacterCue: resolveCoordinateEvidence(
      occurrences.map((occurrence) => occurrence.rightCharacterCue.bounds.x),
      coordinateTolerance,
    ),
    rightDialogue: resolveCoordinateEvidence(
      occurrences.map((occurrence) => occurrence.rightDialogue.bounds.x),
      coordinateTolerance,
    ),
  };
}
