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
  const sceneHeadings = findSceneHeadings(
    recognitionLines,
    sequences.reservedLines,
    layout,
    coordinateTolerance,
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
    ...sceneHeadingByLine.keys(),
    ...sceneNumberFragments,
  ]);
  const actionLineMeasure = inferActionLineMeasure(
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
    ...sceneHeadingByLine.keys(),
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
        ...createOrdinaryDialogue(dialogue, sentenceSpacingConvention),
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
        sceneHeading.heading,
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
): readonly (Character | Parenthetical | Dialogue)[] {
  return [
    createCharacter(occurrence.characterCue),
    ...occurrence.content.map((content) =>
      createDialogueContent(content, sentenceSpacingConvention),
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
      "wrap",
      sentenceSpacingConvention,
    ),
  };
}

function createCharacter(line: PhysicalTextLine): Character {
  const text = createStyledText([line]);
  const value = styledTextValue(text);
  const continuation = /\s*\(CONT'D\)\s*$/iu.exec(value);

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
