import type {
  Action,
  Dialogue,
  DialogueSequence,
  DualDialogue,
  Lyric,
  Parenthetical,
  SceneHeading,
  ScreenplayDocument,
  ScreenplayElement,
  StyledText,
  TitlePageField,
} from "../core/screenplay-document.js";
import {
  assertValidFdxText,
  assertValidStyledText,
  escapeXmlAttribute,
  plainStyledText,
  splitStyledTextLines,
  styledTextToFDX,
} from "./styled-text-to-fdx.js";

type TitleAlignment = "Center" | "Left" | "Right";

interface ParagraphAttributes {
  readonly alignment?: "Center";
  readonly number?: string;
  readonly startsNewPage?: boolean;
}

interface TitleParagraph {
  readonly alignment?: TitleAlignment;
  readonly text: StyledText;
}

const titleAlignments: Readonly<Record<string, TitleAlignment>> = {
  title: "Center",
  credit: "Center",
  author: "Center",
  authors: "Center",
  source: "Center",
  "draft date": "Left",
  contact: "Left",
  copyright: "Left",
  notes: "Right",
};

export function screenplayDocumentToFDX(
  document: ScreenplayDocument,
): string {
  validateDocument(document);

  const content = serializeBody(document.elements);
  const titlePage = serializeTitlePage(document.titlePage);

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="1">',
    `  <Content>${content}</Content>`,
    ...(titlePage === null ? [] : [`  <TitlePage><Content>${titlePage}</Content></TitlePage>`]),
    "</FinalDraft>",
  ].join("\n");
}

function validateDocument(document: ScreenplayDocument): void {
  for (const field of document.titlePage) {
    assertValidFdxText(field.key);

    for (const value of field.values) {
      assertValidStyledText(value);
    }
  }

  for (const element of document.elements) {
    validateElement(element);
  }
}

function validateElement(element: ScreenplayElement): void {
  if (element.type === "page-break") {
    return;
  }

  if (element.type === "dual-dialogue") {
    validateDialogueSequence(element.left);
    validateDialogueSequence(element.right);
    return;
  }

  assertValidStyledText(element.text);

  if (element.type === "scene-heading" && element.sceneNumber !== null) {
    assertValidFdxText(element.sceneNumber);
  }
}

function validateDialogueSequence(sequence: DialogueSequence): void {
  assertValidStyledText(sequence.character.text);

  for (const content of sequence.content) {
    assertValidStyledText(content.text);
  }
}

function serializeBody(elements: readonly ScreenplayElement[]): string {
  const paragraphs: string[] = [];
  let pendingPageBreaks = 0;

  for (const element of elements) {
    if (element.type === "page-break") {
      pendingPageBreaks += 1;
      continue;
    }

    for (let breakIndex = 1; breakIndex < pendingPageBreaks; breakIndex += 1) {
      paragraphs.push(serializeEmptyPageBreak());
    }

    paragraphs.push(serializeElement(element, pendingPageBreaks > 0));
    pendingPageBreaks = 0;
  }

  for (let breakIndex = 0; breakIndex < pendingPageBreaks; breakIndex += 1) {
    paragraphs.push(serializeEmptyPageBreak());
  }

  return paragraphs.join("");
}

function serializeElement(
  element: Exclude<ScreenplayElement, { readonly type: "page-break" }>,
  startsNewPage: boolean,
): string {
  switch (element.type) {
    case "scene-heading":
      return serializeSceneHeading(element, startsNewPage);
    case "action":
      return serializeAction(element, startsNewPage);
    case "character":
      return serializeTypedParagraph("Character", element.text, {
        startsNewPage,
      });
    case "parenthetical":
      return serializeTypedParagraph("Parenthetical", element.text, {
        startsNewPage,
      });
    case "dialogue":
      return serializeTypedParagraph("Dialogue", element.text, {
        startsNewPage,
      });
    case "dual-dialogue":
      return serializeDualDialogue(element, startsNewPage);
    case "lyric":
      return serializeLyric(element, startsNewPage);
    case "transition":
      return serializeTypedParagraph("Transition", element.text, {
        startsNewPage,
      });
  }
}

function serializeSceneHeading(
  sceneHeading: SceneHeading,
  startsNewPage: boolean,
): string {
  return serializeTypedParagraph("Scene Heading", sceneHeading.text, {
    number: sceneHeading.sceneNumber ?? undefined,
    startsNewPage,
  });
}

function serializeAction(action: Action, startsNewPage: boolean): string {
  return serializeTypedParagraph("Action", action.text, {
    alignment: action.alignment === "center" ? "Center" : undefined,
    startsNewPage,
  });
}

function serializeLyric(lyric: Lyric, startsNewPage: boolean): string {
  return serializeTypedParagraph("Action", lyric.text, { startsNewPage }, [
    "italic",
  ]);
}

function serializeDualDialogue(
  dualDialogue: DualDialogue,
  startsNewPage: boolean,
): string {
  const attributes = serializeParagraphAttributes({ startsNewPage });
  const dialogue = [
    serializeDialogueSequence(dualDialogue.left),
    serializeDialogueSequence(dualDialogue.right),
  ].join("");

  return `<Paragraph${attributes}><DualDialogue>${dialogue}</DualDialogue></Paragraph>`;
}

function serializeDialogueSequence(sequence: DialogueSequence): string {
  return [
    serializeTypedParagraph("Character", sequence.character.text),
    ...sequence.content.map(serializeDialogueContent),
  ].join("");
}

function serializeDialogueContent(content: Parenthetical | Dialogue): string {
  return serializeTypedParagraph(
    content.type === "parenthetical" ? "Parenthetical" : "Dialogue",
    content.text,
  );
}

function serializeTypedParagraph(
  type: string,
  text: StyledText,
  attributes: ParagraphAttributes = {},
  addedStyles: Parameters<typeof styledTextToFDX>[1] = [],
): string {
  const paragraphAttributes = serializeParagraphAttributes(attributes);

  return `<Paragraph Type="${type}"${paragraphAttributes}>${styledTextToFDX(text, addedStyles)}</Paragraph>`;
}

function serializeParagraphAttributes(
  attributes: ParagraphAttributes,
): string {
  const serialized: string[] = [];

  if (attributes.alignment !== undefined) {
    serialized.push(`Alignment="${attributes.alignment}"`);
  }

  if (attributes.number !== undefined) {
    serialized.push(`Number="${escapeXmlAttribute(attributes.number)}"`);
  }

  if (attributes.startsNewPage === true) {
    serialized.push('StartsNewPage="Yes"');
  }

  return serialized.length === 0 ? "" : ` ${serialized.join(" ")}`;
}

function serializeEmptyPageBreak(): string {
  return '<Paragraph Type="Action" StartsNewPage="Yes"></Paragraph>';
}

function serializeTitlePage(
  fields: readonly TitlePageField[],
): string | null {
  if (fields.length === 0) {
    return null;
  }

  return fields.flatMap(titleFieldToParagraphs).map(serializeTitleParagraph).join("");
}

function titleFieldToParagraphs(field: TitlePageField): readonly TitleParagraph[] {
  const alignment = titleAlignments[field.key.trim().toLowerCase()];

  if (field.values.length === 0) {
    return [{ alignment, text: plainStyledText(`${field.key}:`) }];
  }

  if (alignment !== undefined) {
    return field.values.flatMap((value) =>
      splitStyledTextLines(value).map((text) => ({ alignment, text }))
    );
  }

  const valueLines = field.values.map(splitStyledTextLines);
  const usesInlineLayout = valueLines.length === 1 && valueLines[0]!.length === 1;

  if (usesInlineLayout) {
    return [{
      text: {
        runs: [
          { text: `${field.key}: `, styles: [] },
          ...valueLines[0]![0]!.runs,
        ],
      },
    }];
  }

  return [
    { text: plainStyledText(`${field.key}:`) },
    ...valueLines.flat().map((text) => ({ text })),
  ];
}

function serializeTitleParagraph(paragraph: TitleParagraph): string {
  const alignment = paragraph.alignment === undefined
    ? ""
    : ` Alignment="${paragraph.alignment}"`;

  return `<Paragraph${alignment}>${styledTextToFDX(paragraph.text)}</Paragraph>`;
}
