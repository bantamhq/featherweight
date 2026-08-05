import { describe, expect, it } from "vitest";

import type {
  ScreenplayDocument,
  StyledText,
  TextRun,
  TextStyle,
} from "../../../src/core/screenplay-document.js";
import { screenplayDocumentToFDX } from "../../../src/fdx/screenplay-document-to-fdx.js";
import { ScreenplayConversionError } from "../../../src/index.js";
import {
  elementChildren,
  elementText,
  firstElement,
  parseFdxDocument,
  type XmlElement,
} from "../../support/fdx-document.js";

describe("screenplayDocumentToFDX", () => {
  it("maps every direct model variant and positional title field without losing fallback information", () => {
    const document: ScreenplayDocument = {
      titlePage: [
        {
          key: " title ",
          values: [styled(run("FIRST\nSECOND", ["bold"]))],
        },
        { key: "Credit", values: [plain("Written by")] },
        { key: "Authors", values: [plain("Ada & Bea")] },
        { key: "Source", values: [plain("A novel")] },
        { key: "Draft date", values: [plain("2026-08-05")] },
        { key: "Contact", values: [plain("mail@example.test")] },
        { key: "Copyright", values: [plain("Copyright 2026")] },
        { key: "Notes", values: [plain("Private note")] },
        { key: "Custom", values: [plain("one line")] },
        {
          key: "Gallery",
          values: [plain("first"), plain("second\n\nthird")],
        },
        { key: "Empty", values: [] },
        { key: "Author", values: [] },
      ],
      elements: [
        scene("INT. LAB & CELLAR - NIGHT", "A&\"7\""),
        scene("MEMORY", null),
        action("Standard action."),
        action("Centered action.", "center"),
        { type: "character", text: plain("ADA") },
        { type: "parenthetical", text: plain("(quietly)") },
        { type: "dialogue", text: plain("Exact words.") },
        { type: "transition", text: plain("CUT TO:") },
        {
          type: "lyric",
          text: styled(
            run("Sing "),
            run("bright", ["bold", "underline"]),
          ),
        },
      ],
    };

    const root = parseFdxDocument(screenplayDocumentToFDX(document));
    const paragraphs = bodyParagraphs(root);

    expect(root).toMatchObject({
      name: "FinalDraft",
      attributes: {
        DocumentType: "Script",
        Template: "No",
        Version: "1",
      },
    });
    expect(elementChildren(root).map((element) => element.name)).toEqual([
      "Content",
      "TitlePage",
    ]);
    expect(paragraphs.map((paragraph) => paragraph.attributes.Type)).toEqual([
      "Scene Heading",
      "Scene Heading",
      "Action",
      "Action",
      "Character",
      "Parenthetical",
      "Dialogue",
      "Transition",
      "Action",
    ]);
    expect(paragraphs.map(paragraphText)).toEqual([
      "INT. LAB & CELLAR - NIGHT",
      "MEMORY",
      "Standard action.",
      "Centered action.",
      "ADA",
      "(quietly)",
      "Exact words.",
      "CUT TO:",
      "Sing bright",
    ]);
    expect(paragraphs[0]!.attributes.Number).toBe('A&"7"');
    expect(paragraphs[1]!.attributes.Number).toBeUndefined();
    expect(paragraphs.map((paragraph) => paragraph.attributes.Alignment)).toEqual([
      undefined,
      undefined,
      undefined,
      "Center",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(textRuns(paragraphs[8]!)).toEqual([
      { text: "Sing ", style: "Italic" },
      { text: "bright", style: "Bold+Italic+Underline" },
    ]);
    expect(descendantElements(root, "Singing")).toEqual([]);

    const titleParagraphs = elementChildren(
      firstElement(firstElement(root, "TitlePage"), "Content"),
      "Paragraph",
    );
    expect(titleParagraphs.map(paragraphText)).toEqual([
      "FIRST",
      "SECOND",
      "Written by",
      "Ada & Bea",
      "A novel",
      "2026-08-05",
      "mail@example.test",
      "Copyright 2026",
      "Private note",
      "Custom: one line",
      "Gallery:",
      "first",
      "second",
      "",
      "third",
      "Empty:",
      "Author:",
    ]);
    expect(titleParagraphs.slice(0, 9).map((paragraph) =>
      paragraph.attributes.Alignment
    )).toEqual([
      "Center",
      "Center",
      "Center",
      "Center",
      "Center",
      "Left",
      "Left",
      "Left",
      "Right",
    ]);
    expect(titleParagraphs.at(-1)!.attributes.Alignment).toBe("Center");
    expect(textRuns(titleParagraphs[0]!)).toEqual([
      { text: "FIRST", style: "Bold" },
    ]);
    expect(textRuns(titleParagraphs[1]!)).toEqual([
      { text: "SECOND", style: "Bold" },
    ]);
  });

  it("preserves run boundaries, styles, XML characters, Unicode, and normalized multiline text while rejecting invalid XML text", () => {
    const document: ScreenplayDocument = {
      titlePage: [],
      elements: [
        {
          type: "scene-heading",
          text: plain("INT. <LAB> & CAFÉ — NIGHT"),
          sceneNumber: 'A<&"2"',
        },
        action(
          styled(
            run("plain "),
            run("bold", ["bold"]),
            run(" italic", ["italic"]),
            run(" underline", ["underline"]),
            run(" strike", ["strikeout"]),
            run(" all", ["strikeout", "underline", "italic", "bold"]),
            run(" together"),
          ),
        ),
        action("first\r\nsecond\rthird"),
      ],
    };

    const paragraphs = bodyParagraphs(
      parseFdxDocument(screenplayDocumentToFDX(document)),
    );

    expect(paragraphs[0]!.attributes.Number).toBe('A<&"2"');
    expect(paragraphText(paragraphs[0]!)).toBe("INT. <LAB> & CAFÉ — NIGHT");
    expect(textRuns(paragraphs[1]!)).toEqual([
      { text: "plain ", style: undefined },
      { text: "bold", style: "Bold" },
      { text: " italic", style: "Italic" },
      { text: " underline", style: "Underline" },
      { text: " strike", style: "Strikeout" },
      { text: " all", style: "Bold+Italic+Underline+Strikeout" },
      { text: " together", style: undefined },
    ]);
    expect(paragraphText(paragraphs[1]!)).toBe(
      "plain bold italic underline strike all together",
    );
    expect(paragraphText(paragraphs[2]!)).toBe("first\nsecond\nthird");

    const invalidDocuments: readonly ScreenplayDocument[] = [
      {
        titlePage: [],
        elements: [action("before\u0001after")],
      },
      {
        titlePage: [],
        elements: [action("before\uD800after")],
      },
      {
        titlePage: [],
        elements: [scene("INT. LAB - NIGHT", "before\u0001after")],
      },
      {
        titlePage: [{ key: "before\u0001after", values: [] }],
        elements: [],
      },
      {
        titlePage: [{ key: "Title", values: [plain("before\u0001after")] }],
        elements: [],
      },
    ];

    for (const invalidDocument of invalidDocuments) {
      const error = captureError(() =>
        screenplayDocumentToFDX(invalidDocument)
      );

      expect(error).toBeInstanceOf(ScreenplayConversionError);
      expect(error).toMatchObject({ code: "INVALID_FDX_TEXT" });
    }
  });

  it("keeps ordinary, orphan, dual, and empty dialogue ownership visible in source order", () => {
    const document: ScreenplayDocument = {
      titlePage: [],
      elements: [
        { type: "character", text: plain("CAPTAIN") },
        { type: "parenthetical", text: plain("(low)") },
        { type: "dialogue", text: plain("Ordinary.") },
        { type: "dialogue", text: plain("Orphan dialogue.") },
        { type: "parenthetical", text: plain("(orphan)") },
        { type: "character", text: plain("ORPHAN CHARACTER") },
        {
          type: "dual-dialogue",
          left: {
            character: { type: "character", text: plain("LEFT") },
            content: [
              { type: "parenthetical", text: plain("(first)") },
              { type: "dialogue", text: plain("Left line.") },
            ],
          },
          right: {
            character: { type: "character", text: plain("RIGHT") },
            content: [
              { type: "dialogue", text: plain("Right one.") },
              { type: "parenthetical", text: plain("(then)") },
              { type: "dialogue", text: plain("Right two.") },
            ],
          },
        },
        {
          type: "dual-dialogue",
          left: {
            character: { type: "character", text: plain("EMPTY LEFT") },
            content: [],
          },
          right: {
            character: { type: "character", text: plain("EMPTY RIGHT") },
            content: [],
          },
        },
      ],
    };

    const paragraphs = bodyParagraphs(
      parseFdxDocument(screenplayDocumentToFDX(document)),
    );

    expect(paragraphs.slice(0, 6).map((paragraph) => ({
      type: paragraph.attributes.Type,
      text: paragraphText(paragraph),
    }))).toEqual([
      { type: "Character", text: "CAPTAIN" },
      { type: "Parenthetical", text: "(low)" },
      { type: "Dialogue", text: "Ordinary." },
      { type: "Dialogue", text: "Orphan dialogue." },
      { type: "Parenthetical", text: "(orphan)" },
      { type: "Character", text: "ORPHAN CHARACTER" },
    ]);
    expect(dualParagraphs(paragraphs[6]!)).toEqual([
      { type: "Character", text: "LEFT" },
      { type: "Parenthetical", text: "(first)" },
      { type: "Dialogue", text: "Left line." },
      { type: "Character", text: "RIGHT" },
      { type: "Dialogue", text: "Right one." },
      { type: "Parenthetical", text: "(then)" },
      { type: "Dialogue", text: "Right two." },
    ]);
    expect(dualParagraphs(paragraphs[7]!)).toEqual([
      { type: "Character", text: "EMPTY LEFT" },
      { type: "Character", text: "EMPTY RIGHT" },
    ]);
  });

  it("attaches page breaks to following content and uses empty Action fallbacks only when needed", () => {
    const document: ScreenplayDocument = {
      titlePage: [],
      elements: [
        { type: "page-break" },
        action("Leading target."),
        { type: "character", text: plain("VOICE") },
        { type: "page-break" },
        { type: "dialogue", text: plain("Dialogue target.") },
        { type: "page-break" },
        { type: "page-break" },
        {
          type: "dual-dialogue",
          left: {
            character: { type: "character", text: plain("LEFT") },
            content: [{ type: "dialogue", text: plain("One.") }],
          },
          right: {
            character: { type: "character", text: plain("RIGHT") },
            content: [{ type: "dialogue", text: plain("Two.") }],
          },
        },
        action("After dual."),
        { type: "page-break" },
        { type: "page-break" },
      ],
    };

    const paragraphs = bodyParagraphs(
      parseFdxDocument(screenplayDocumentToFDX(document)),
    );

    expect(paragraphs.map((paragraph) => ({
      type: paragraph.attributes.Type,
      text: paragraphText(paragraph),
      startsNewPage: paragraph.attributes.StartsNewPage,
      dual: elementChildren(paragraph, "DualDialogue").length === 1,
    }))).toEqual([
      { type: "Action", text: "Leading target.", startsNewPage: "Yes", dual: false },
      { type: "Character", text: "VOICE", startsNewPage: undefined, dual: false },
      { type: "Dialogue", text: "Dialogue target.", startsNewPage: "Yes", dual: false },
      { type: "Action", text: "", startsNewPage: "Yes", dual: false },
      { type: undefined, text: "LEFTOne.RIGHTTwo.", startsNewPage: "Yes", dual: true },
      { type: "Action", text: "After dual.", startsNewPage: undefined, dual: false },
      { type: "Action", text: "", startsNewPage: "Yes", dual: false },
      { type: "Action", text: "", startsNewPage: "Yes", dual: false },
    ]);
  });

  it("emits deterministic parseable empty FDX without mutating a deeply frozen document", () => {
    const emptyFdx = screenplayDocumentToFDX({ titlePage: [], elements: [] });
    const emptyRoot = parseFdxDocument(emptyFdx);

    expect(elementChildren(firstElement(emptyRoot, "Content"), "Paragraph")).toEqual([]);
    expect(elementChildren(emptyRoot, "TitlePage")).toEqual([]);

    const document = deepFreeze<ScreenplayDocument>({
      titlePage: [{ key: "Title", values: [plain("Stable title")] }],
      elements: [action(styled(run("Stable "), run("body", ["italic"])))],
    });
    const original = structuredClone(document);
    const first = screenplayDocumentToFDX(document);
    const second = screenplayDocumentToFDX(document);

    expect(second).toBe(first);
    expect(document).toEqual(original);
  });
});

function bodyParagraphs(root: XmlElement): readonly XmlElement[] {
  return elementChildren(firstElement(root, "Content"), "Paragraph");
}

function paragraphText(paragraph: XmlElement): string {
  return descendantElements(paragraph, "Text").map(elementText).join("");
}

function textRuns(paragraph: XmlElement) {
  return elementChildren(paragraph, "Text").map((text) => ({
    text: elementText(text),
    style: text.attributes.Style,
  }));
}

function dualParagraphs(container: XmlElement) {
  return elementChildren(
    firstElement(container, "DualDialogue"),
    "Paragraph",
  ).map((paragraph) => ({
    type: paragraph.attributes.Type,
    text: paragraphText(paragraph),
  }));
}

function descendantElements(
  element: XmlElement,
  name: string,
): readonly XmlElement[] {
  return elementChildren(element).flatMap((child) => [
    ...(child.name === name ? [child] : []),
    ...descendantElements(child, name),
  ]);
}

function run(text: string, styles: readonly TextStyle[] = []): TextRun {
  return { text, styles };
}

function styled(...runs: readonly TextRun[]): StyledText {
  return { runs };
}

function plain(text: string): StyledText {
  return styled(run(text));
}

function scene(text: string, sceneNumber: string | null) {
  return { type: "scene-heading" as const, text: plain(text), sceneNumber };
}

function action(
  text: string | StyledText,
  alignment: "standard" | "center" = "standard",
) {
  return {
    type: "action" as const,
    text: typeof text === "string" ? plain(text) : text,
    alignment,
  };
}

function captureError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }

  throw new Error("Expected conversion to throw.");
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}
