import { inferCoordinateTolerance } from "../layout/coordinate-evidence.js";
import type { ScreenplayLayout } from "../layout/screenplay-layout.js";
import {
  findScreenplaySequences,
  type DialogueContentOccurrence,
  type DialogueOccurrence,
  type DualDialogueOccurrence,
} from "../layout/screenplay-sequences.js";
import type { NormalizedText } from "../normalized-text.js";
import type { PhysicalTextLine } from "../physical-lines.js";
import type {
  Character,
  Dialogue,
  DialogueSequence,
  DualDialogue,
  Parenthetical,
  ScreenplayDocument,
  ScreenplayElement,
  Transition,
} from "../screenplay-document.js";
import {
  collectActionLines,
  createAction,
  createSceneHeading,
  extractTitlePage,
  findCenteredActionLines,
  findSceneHeadings,
  inferActionLineMeasure,
} from "./screenplay-blocks.js";
import {
  createStyledText,
  sliceStyledText,
  styledTextValue,
} from "./styled-text.js";
import {
  inferSentenceSpacingConvention,
  type SentenceSpacingConvention,
} from "./sentence-spacing.js";

export function recognizeScreenplay(
  normalizedText: NormalizedText,
  layout: ScreenplayLayout,
): ScreenplayDocument {
  const lines = normalizedText.pages.flatMap((page) => page.lines);

  if (lines.length === 0) {
    return { titlePage: [], elements: [] };
  }

  const coordinateTolerance = inferCoordinateTolerance(lines);
  const sentenceSpacingConvention = inferSentenceSpacingConvention(lines);
  const titlePage = extractTitlePage(lines, layout, coordinateTolerance);
  const bodyLines = titlePage.bodyLines;
  const unattributedLines = new Set(titlePage.unattributedLines);
  const recognitionLines = bodyLines.filter(
    (line) => !unattributedLines.has(line),
  );
  const sequences = findScreenplaySequences(
    recognitionLines,
    coordinateTolerance,
  );
  const dualDialogueByCue = new Map<
    PhysicalTextLine,
    DualDialogueOccurrence
  >(
    sequences.dualDialogueOccurrences.map(
      (occurrence): [PhysicalTextLine, DualDialogueOccurrence] => [
        occurrence.leftCharacterCue,
        occurrence,
      ],
    ),
  );
  const dialogueByCue = new Map<PhysicalTextLine, DialogueOccurrence>(
    sequences.dialogueOccurrences.map(
      (occurrence): [PhysicalTextLine, DialogueOccurrence] => [
        occurrence.characterCue,
        occurrence,
      ],
    ),
  );
  const transitionLines = new Set(sequences.transitionLines);
  const actionLineMeasure = inferActionLineMeasure(
    recognitionLines,
    layout,
    coordinateTolerance,
  );
  const sceneHeadings = findSceneHeadings(
    recognitionLines,
    sequences.reservedLines,
    layout,
    coordinateTolerance,
    actionLineMeasure,
  );
  const sceneHeadingByLine = new Map(
    sceneHeadings.map(
      (evidence): [PhysicalTextLine, (typeof sceneHeadings)[number]] => [
        evidence.heading,
        evidence,
      ],
    ),
  );
  const sceneNumberFragments = new Set(
    sceneHeadings.flatMap((evidence) => evidence.numberFragments),
  );
  const consumedLines = new Set<PhysicalTextLine>();
  const elements: ScreenplayElement[] = [];
  const centeredEvidenceBlockedLines = new Set([
    ...unattributedLines,
    ...[...sequences.reservedLines].filter(
      (line) => !transitionLines.has(line),
    ),
    ...sceneHeadings.flatMap((evidence) => evidence.headingLines),
    ...sceneNumberFragments,
  ]);
  const dialogueLineMeasure = inferDialogueLineMeasure(
    recognitionLines,
    layout,
    coordinateTolerance,
  );
  const centeredActionLines = findCenteredActionLines(
    bodyLines,
    centeredEvidenceBlockedLines,
    layout,
    coordinateTolerance,
  );
  const centeredTransitionLines = new Set(
    sequences.transitionLines.filter((line) => centeredActionLines.has(line)),
  );
  const blockedActionLines = new Set([
    ...unattributedLines,
    ...[...sequences.reservedLines].filter(
      (line) => !centeredTransitionLines.has(line),
    ),
    ...sceneHeadings.flatMap((evidence) => evidence.headingLines),
    ...sceneNumberFragments,
  ]);

  for (let index = 0; index < bodyLines.length; index += 1) {
    const line = bodyLines[index]!;

    if (consumedLines.has(line) || sceneNumberFragments.has(line)) {
      continue;
    }

    const dualDialogue = dualDialogueByCue.get(line);

    if (dualDialogue !== undefined) {
      elements.push(
        createDualDialogue(dualDialogue, sentenceSpacingConvention),
      );
      addConsumedLines(consumedLines, dualDialogue.lines);
      continue;
    }

    const dialogue = dialogueByCue.get(line);

    if (dialogue !== undefined) {
      elements.push(
        ...createOrdinaryDialogue(
          dialogue,
          sentenceSpacingConvention,
          dialogueLineMeasure,
        ),
      );
      addConsumedLines(consumedLines, [
        dialogue.characterCue,
        ...dialogue.content.flatMap((content) => content.lines),
      ]);
      continue;
    }

    const sceneHeading = sceneHeadingByLine.get(line);

    if (sceneHeading !== undefined) {
      elements.push(createSceneHeading(sceneHeading));
      addConsumedLines(consumedLines, [
        ...sceneHeading.headingLines,
        ...sceneHeading.numberFragments,
      ]);
      continue;
    }

    if (transitionLines.has(line) && !centeredTransitionLines.has(line)) {
      elements.push(createTransition(line));
      consumedLines.add(line);
      continue;
    }

    const actionGroup = collectActionLines({
      lines: bodyLines,
      startIndex: index,
      blockedLines: blockedActionLines,
      layout,
      coordinateTolerance,
      actionLineMeasure,
      centeredActionLines,
    });
    elements.push(
      createAction(
        actionGroup.lines,
        actionGroup.lineJoins,
        centeredActionLines,
        sentenceSpacingConvention,
      ),
    );
    addConsumedLines(consumedLines, actionGroup.lines);
    index = actionGroup.nextIndex - 1;
  }

  return { titlePage: titlePage.fields, elements };
}

function createOrdinaryDialogue(
  occurrence: DialogueOccurrence,
  sentenceSpacingConvention: SentenceSpacingConvention,
  dialogueLineMeasure: number | null,
): readonly (Character | Parenthetical | Dialogue)[] {
  return [
    createCharacter(occurrence.characterCue),
    ...occurrence.content.map((content) =>
      createDialogueContent(
        content,
        sentenceSpacingConvention,
        dialogueLineMeasure,
      ),
    ),
  ];
}

function createDualDialogue(
  occurrence: DualDialogueOccurrence,
  sentenceSpacingConvention: SentenceSpacingConvention,
): DualDialogue {
  return {
    type: "dual-dialogue",
    left: createDialogueSequence(
      occurrence.leftCharacterCue,
      occurrence.leftContent,
      sentenceSpacingConvention,
    ),
    right: createDialogueSequence(
      occurrence.rightCharacterCue,
      occurrence.rightContent,
      sentenceSpacingConvention,
    ),
  };
}

function createDialogueSequence(
  characterCue: PhysicalTextLine,
  content: readonly DialogueContentOccurrence[],
  sentenceSpacingConvention: SentenceSpacingConvention,
): DialogueSequence {
  return {
    character: createCharacter(characterCue),
    content: content.map((item) =>
      createDialogueContent(item, sentenceSpacingConvention),
    ),
  };
}

function createDialogueContent(
  occurrence: DialogueContentOccurrence,
  sentenceSpacingConvention: SentenceSpacingConvention,
  dialogueLineMeasure: number | null = null,
): Parenthetical | Dialogue {
  if (occurrence.type === "parenthetical") {
    return {
      type: "parenthetical",
      text: createStyledText(
        occurrence.lines,
        "wrap",
        sentenceSpacingConvention,
      ),
    };
  }

  return {
    type: "dialogue",
    text: createStyledText(
      occurrence.lines,
      createDialogueLineJoins(occurrence.lines, dialogueLineMeasure),
      sentenceSpacingConvention,
    ),
  };
}

function inferDialogueLineMeasure(
  lines: readonly PhysicalTextLine[],
  layout: ScreenplayLayout,
  coordinateTolerance: number,
): number | null {
  if (layout.dialogue === null) {
    return null;
  }

  const widths = lines
    .filter(
      (line) =>
        Math.abs(line.bounds.x - layout.dialogue!.x) <= coordinateTolerance,
    )
    .map((line) => line.bounds.width)
    .sort((left, right) => left - right);

  if (widths.length === 0) {
    return null;
  }

  return widths[Math.floor((widths.length - 1) * 0.9)]!;
}

function createDialogueLineJoins(
  lines: readonly PhysicalTextLine[],
  dialogueLineMeasure: number | null,
): readonly ("wrap" | "newline")[] {
  if (dialogueLineMeasure === null) {
    return [];
  }

  const lineJoins: ("wrap" | "newline")[] = [];

  for (const [index, line] of lines.slice(1).entries()) {
    const previousLine = lines[index]!;
    const visibleShortfall =
      Math.min(previousLine.bounds.height, line.bounds.height) * 5;
    const previousLineIsShort =
      previousLine.bounds.width + visibleShortfall < dialogueLineMeasure;
    const lineIsShort =
      line.bounds.width + visibleShortfall < dialogueLineMeasure;
    const previousLineEndsSentence = /[.!?…]["'’”)]?\s*$/u.test(
      previousLine.text,
    );
    const continuesEstablishedLineation =
      lineJoins.at(-1) === "newline" && previousLineEndsSentence;
    const preservesDeliberateBreak =
      previousLine.pageIndex === line.pageIndex &&
      hasEmphasizedStyle(previousLine) &&
      haveMatchingLineStyles(previousLine, line) &&
      ((previousLineIsShort && (lineIsShort || previousLineEndsSentence)) ||
        continuesEstablishedLineation);

    lineJoins.push(preservesDeliberateBreak ? "newline" : "wrap");
  }

  return lineJoins;
}

function hasEmphasizedStyle(line: PhysicalTextLine): boolean {
  return line.spans.some(
    (span) =>
      span.style.bold ||
      span.style.italic ||
      span.style.underline ||
      span.style.strikeout,
  );
}

function haveMatchingLineStyles(
  left: PhysicalTextLine,
  right: PhysicalTextLine,
): boolean {
  const leftStyle = left.spans[0]?.style;
  const rightStyle = right.spans[0]?.style;

  if (leftStyle === undefined || rightStyle === undefined) {
    return false;
  }

  return (
    left.spans.every((span) => haveMatchingStyles(span.style, leftStyle)) &&
    right.spans.every((span) => haveMatchingStyles(span.style, rightStyle)) &&
    haveMatchingStyles(leftStyle, rightStyle)
  );
}

function haveMatchingStyles(
  left: PhysicalTextLine["spans"][number]["style"],
  right: PhysicalTextLine["spans"][number]["style"],
): boolean {
  return (
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.strikeout === right.strikeout
  );
}

function createCharacter(line: PhysicalTextLine): Character {
  const text = createStyledText([line]);
  const value = styledTextValue(text);
  const continuation = /\s*\(CONT['’]D\)\s*$/iu.exec(value);

  if (continuation === null || continuation.index === undefined) {
    return { type: "character", text };
  }

  const prefixLength = value.slice(0, continuation.index).trimEnd().length;
  return { type: "character", text: sliceStyledText(text, prefixLength) };
}

function createTransition(line: PhysicalTextLine): Transition {
  return { type: "transition", text: createStyledText([line]) };
}

function addConsumedLines(
  consumedLines: Set<PhysicalTextLine>,
  lines: readonly PhysicalTextLine[],
): void {
  for (const line of lines) {
    consumedLines.add(line);
  }
}
