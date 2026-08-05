import type {
  Action,
  Character,
  Dialogue,
  DialogueSequence,
  DualDialogue,
  Lyric,
  Parenthetical,
  SceneHeading,
  ScreenplayDocument,
  ScreenplayElement,
  TitlePageField,
  Transition,
} from "../core/screenplay-document.js";
import {
  renderedText,
  styledTextToFountain,
  unstyledTextToFountain,
} from "./styled-text-to-fountain.js";

const automaticSceneHeadingPattern =
  /^(?:INT\.\/EXT|INT\/EXT|INT|EXT|EST|I\/E)(?:[. ])/i;

export function screenplayDocumentToFountain(
  document: ScreenplayDocument,
): string {
  const titlePage = serializeTitlePage(document.titlePage);
  const bodyBlocks = serializeBody(document.elements);
  const documentSections =
    titlePage.length > 0 ? [titlePage, ...bodyBlocks] : bodyBlocks;

  if (documentSections.length === 0) {
    return "";
  }

  return `${documentSections.join("\n\n")}\n`;
}

function serializeTitlePage(fields: readonly TitlePageField[]): string {
  return fields.map(serializeTitlePageField).join("\n");
}

function serializeTitlePageField(field: TitlePageField): string {
  if (field.values.length === 0) {
    return `${field.key}:`;
  }

  const serializedValues = field.values.map(styledTextToFountain);
  const usesIndentedLayout =
    serializedValues.length > 1 ||
    serializedValues.some((value) => value.includes("\n"));

  if (!usesIndentedLayout) {
    return `${field.key}: ${serializedValues[0]}`;
  }

  const indentedLines = serializedValues.flatMap((value) =>
    value.split("\n").map((line) => `    ${line}`),
  );

  return [`${field.key}:`, ...indentedLines].join("\n");
}

function serializeBody(elements: readonly ScreenplayElement[]): string[] {
  const blocks: string[] = [];

  for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
    const element = elements[elementIndex];

    if (element.type === "character") {
      const dialogueLines = [serializeCharacter(element)];
      let dialogueContent = elements[elementIndex + 1];

      while (isDialogueContent(dialogueContent)) {
        elementIndex += 1;
        dialogueLines.push(serializeDialogueContent(dialogueContent));
        dialogueContent = elements[elementIndex + 1];
      }

      blocks.push(dialogueLines.join("\n"));
      continue;
    }

    blocks.push(serializeElement(element));
  }

  return blocks;
}

function serializeElement(element: ScreenplayElement): string {
  switch (element.type) {
    case "scene-heading":
      return serializeSceneHeading(element);
    case "action":
      return serializeAction(element);
    case "character":
      return serializeCharacter(element);
    case "parenthetical":
      return serializeParenthetical(element);
    case "dialogue":
      return serializeDialogue(element);
    case "dual-dialogue":
      return serializeDualDialogue(element);
    case "lyric":
      return serializeLyric(element);
    case "transition":
      return serializeTransition(element);
    case "page-break":
      return "===";
  }
}

function serializeSceneHeading(sceneHeading: SceneHeading): string {
  const text = renderedText(sceneHeading.text);
  const forceMarker = isAutomaticSceneHeading(text) ? "" : ".";
  const sceneNumber =
    sceneHeading.sceneNumber === null ? "" : ` #${sceneHeading.sceneNumber}#`;

  return `${forceMarker}${unstyledTextToFountain(sceneHeading.text)}${sceneNumber}`;
}

function serializeAction(action: Action): string {
  const text = styledTextToFountain(action.text);

  if (action.alignment === "center") {
    return text
      .split("\n")
      .map((line) => `>${line}<`)
      .join("\n");
  }

  const lines = text.split("\n");

  return lines
    .map((line, lineIndex) =>
      actionLineRequiresForceMarker(lines, lineIndex) ? `!${line}` : line,
    )
    .join("\n");
}

function serializeCharacter(character: Character, dual = false): string {
  const text = renderedText(character.text);
  const forceMarker = isAutomaticCharacter(text) ? "" : "@";
  const dualMarker = dual ? " ^" : "";

  return `${forceMarker}${unstyledTextToFountain(character.text)}${dualMarker}`;
}

function serializeParenthetical(parenthetical: Parenthetical): string {
  return styledTextToFountain(parenthetical.text);
}

function serializeDialogue(dialogue: Dialogue): string {
  const lines = styledTextToFountain(dialogue.text).split("\n");

  return lines.map((line) => (line.length === 0 ? "  " : line)).join("\n");
}

function serializeDualDialogue(dualDialogue: DualDialogue): string {
  return [
    serializeDialogueSequence(dualDialogue.left),
    serializeDialogueSequence(dualDialogue.right, true),
  ].join("\n\n");
}

function serializeDialogueSequence(
  sequence: DialogueSequence,
  dual = false,
): string {
  return [
    serializeCharacter(sequence.character, dual),
    ...sequence.content.map(serializeDialogueContent),
  ].join("\n");
}

function serializeDialogueContent(content: Parenthetical | Dialogue): string {
  return content.type === "parenthetical"
    ? serializeParenthetical(content)
    : serializeDialogue(content);
}

function serializeLyric(lyric: Lyric): string {
  return styledTextToFountain(lyric.text)
    .split("\n")
    .map((line) => `~${line}`)
    .join("\n");
}

function serializeTransition(transition: Transition): string {
  const text = renderedText(transition.text);
  const forceMarker = isAutomaticTransition(text) ? "" : ">";

  return `${forceMarker}${unstyledTextToFountain(transition.text)}`;
}

function isDialogueContent(
  element: ScreenplayElement | undefined,
): element is Parenthetical | Dialogue {
  return element?.type === "parenthetical" || element?.type === "dialogue";
}

function isAutomaticSceneHeading(text: string): boolean {
  return automaticSceneHeadingPattern.test(text);
}

function isAutomaticCharacter(text: string): boolean {
  return text === text.toUpperCase() && /\p{L}/u.test(text);
}

function isAutomaticTransition(text: string): boolean {
  return text === text.toUpperCase() && text.endsWith("TO:");
}

function actionLineRequiresForceMarker(
  lines: readonly string[],
  lineIndex: number,
): boolean {
  const line = lines[lineIndex];
  const syntax = line.trimStart();

  if (syntax.length === 0) {
    return false;
  }

  if (/^[!@#=~>]/u.test(syntax)) {
    return true;
  }

  const previousLineIsBlank =
    lineIndex === 0 || isBlankFountainLine(lines[lineIndex - 1]);

  if (!previousLineIsBlank) {
    return false;
  }

  const nextLineIsBlank =
    lineIndex === lines.length - 1 || isBlankFountainLine(lines[lineIndex + 1]);

  if (
    nextLineIsBlank &&
    (/^\.[\p{L}\p{N}]/u.test(syntax) || isAutomaticSceneHeading(syntax))
  ) {
    return true;
  }

  return (
    (!nextLineIsBlank && isAutomaticCharacter(syntax)) ||
    (nextLineIsBlank && isAutomaticTransition(syntax))
  );
}

function isBlankFountainLine(line: string): boolean {
  return line.trim().length === 0;
}
