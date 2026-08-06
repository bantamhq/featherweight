import { describe, expect, it } from "vitest";

import type { ScreenplayLayout } from "../../../src/core/layout/screenplay-layout.js";
import type { NormalizedText } from "../../../src/core/normalized-text.js";
import type { PhysicalTextLine } from "../../../src/core/physical-lines.js";
import type { TextStyle } from "../../../src/core/screenplay-document.js";
import { recognizeScreenplay } from "../../../src/core/recognition/recognize-screenplay.js";
import {
  action,
  run,
  scene,
  styled,
  titleField,
} from "../../fixtures/semantic/document-builders.js";

interface OwnedLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly styles?: readonly TextStyle[];
}

interface OwnedPage {
  readonly pageIndex: number;
  readonly lines: readonly OwnedLine[];
}

const establishedLayout: ScreenplayLayout = {
  action: { alignment: "left", x: 108 },
  characterCue: { alignment: "left", x: 252 },
  dialogue: { alignment: "left", x: 180 },
  parenthetical: { alignment: "left", x: 216 },
  transition: { alignment: "right", x: 540 },
  dualDialogue: null,
  diagnostics: [],
};

function createPhysicalLine(
  line: OwnedLine,
  pageIndex: number,
  sourceIndex: number,
): PhysicalTextLine {
  const bounds = {
    x: line.x,
    y: line.y,
    width: line.width ?? line.text.length * 7.2,
    height: 12,
  };
  const styles = line.styles ?? [];

  return {
    pageIndex,
    text: line.text,
    bounds,
    spans: [
      {
        start: 0,
        end: line.text.length,
        sourceIndex,
        sourceMethod: "embedded-text",
        bounds,
        font: { name: "Courier Prime", size: 12 },
        style: {
          bold: styles.includes("bold"),
          italic: styles.includes("italic"),
          underline: styles.includes("underline"),
          strikeout: styles.includes("strikeout"),
        },
      },
    ],
  };
}

function normalizedText(pages: readonly OwnedPage[]): NormalizedText {
  let sourceIndex = 0;

  return {
    pages: pages.map((page) => ({
      pageIndex: page.pageIndex,
      lines: page.lines.map((line) =>
        createPhysicalLine(line, page.pageIndex, sourceIndex++),
      ),
    })),
    suppressed: [],
    diagnostics: [],
  };
}

describe("recognizeScreenplay evidence boundaries", () => {
  it("recognizes supported conventional title geometry and otherwise falls back to body Action", () => {
    const unsupportedInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "First retained value", x: 234, y: 700, width: 144 },
          { text: "Second retained value", x: 234, y: 652, width: 144 },
          { text: "Third retained value", x: 234, y: 616, width: 144 },
          { text: "Fourth retained value", x: 396, y: 556, width: 144 },
          { text: "Fifth retained value", x: 72, y: 300 },
          { text: "Sixth retained value", x: 72, y: 276 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          {
            text: "INT. SUPPORTED BODY - DAY",
            x: 108,
            y: 700,
            styles: ["bold"],
          },
        ],
      },
    ]);

    const alternateConventionalInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "PRIMARY TITLE",
            x: 252,
            y: 700,
            width: 108,
            styles: ["bold", "underline"],
          },
          {
            text: "SECOND TITLE",
            x: 252,
            y: 688,
            width: 108,
            styles: ["bold", "underline"],
          },
          { text: "Prepared by", x: 270, y: 652, width: 72 },
          { text: "Writer Name", x: 264, y: 628, width: 84 },
          { text: "Source Material", x: 252, y: 592, width: 108 },
          { text: "2026-08-04", x: 90, y: 300, width: 72 },
          { text: "Production Office", x: 90, y: 276, width: 120 },
          { text: "123 Example Street", x: 90, y: 264, width: 132 },
          { text: "Example City", x: 90, y: 252, width: 84 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          {
            text: "INT. SUPPORTED BODY - DAY",
            x: 108,
            y: 700,
            styles: ["bold"],
          },
        ],
      },
    ]);

    expect(recognizeScreenplay(unsupportedInput, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        action("First retained value"),
        action("Second retained value"),
        action("Third retained value"),
        action("Fourth retained value"),
        action("Fifth retained value"),
        action("Sixth retained value"),
        scene("INT. SUPPORTED BODY - DAY"),
      ],
    });
    expect(
      recognizeScreenplay(alternateConventionalInput, establishedLayout),
    ).toEqual({
      titlePage: [
        {
          key: "Title",
          values: [
            styled(run("PRIMARY TITLE", ["bold", "underline"])),
            styled(run("SECOND TITLE", ["bold", "underline"])),
          ],
        },
        titleField("Credit", "Prepared by"),
        titleField("Author", "Writer Name"),
        titleField("Source", "Source Material"),
        titleField("Draft date", "2026-08-04"),
        titleField(
          "Contact",
          "Production Office",
          "123 Example Street",
          "Example City",
        ),
      ],
      elements: [scene("INT. SUPPORTED BODY - DAY")],
    });
  });

  it("recognizes a standard title page with independent notes and copyright footer regions", () => {
    const input = normalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "Big Fish", x: 278, y: 531, width: 56 },
          { text: "written by", x: 271, y: 483, width: 70 },
          { text: "John August", x: 267, y: 459, width: 77 },
          {
            text: "based on the novel by Daniel Wallace",
            x: 180,
            y: 399,
            width: 252,
          },
          {
            text: "FINAL PRODUCTION DRAFT",
            x: 386,
            y: 207,
            width: 154,
          },
          {
            text: "includes post-production dialogue",
            x: 309,
            y: 195,
            width: 231,
          },
          { text: "and omitted scenes", x: 414, y: 183, width: 126 },
          {
            text: "Copyright © 2003 Columbia Pictures",
            x: 72,
            y: 147,
            width: 238,
          },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          {
            text: "This is a Southern story.",
            x: 108,
            y: 700,
            width: 180,
          },
        ],
      },
      {
        pageIndex: 2,
        lines: [
          {
            text: "INT. RIVER - DAY",
            x: 108,
            y: 700,
            styles: ["bold"],
          },
        ],
      },
    ]);
    expect(recognizeScreenplay(input, establishedLayout)).toEqual({
      titlePage: [
        titleField("Title", "Big Fish"),
        titleField("Credit", "written by"),
        titleField("Author", "John August"),
        titleField("Source", "based on the novel by Daniel Wallace"),
        titleField(
          "Notes",
          "FINAL PRODUCTION DRAFT",
          "includes post-production dialogue",
          "and omitted scenes",
        ),
        titleField("Copyright", "Copyright © 2003 Columbia Pictures"),
      ],
      elements: [
        action("This is a Southern story."),
        scene("INT. RIVER - DAY"),
      ],
    });
  });

  it("recognizes a standalone opening FADE IN as a transition without inventing punctuation", () => {
    const input = normalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "FADE IN", x: 108, y: 700, width: 49 },
          { text: "A RIVER.", x: 108, y: 676, width: 58 },
        ],
      },
    ]);
    const nonTransitionInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "FADE IN THE DISTANCE", x: 108, y: 700, width: 144 },
        ],
      },
    ]);

    expect(recognizeScreenplay(input, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        { type: "transition", text: styled(run("FADE IN")) },
        action("A RIVER."),
      ],
    });
    expect(recognizeScreenplay(nonTransitionInput, establishedLayout)).toEqual({
      titlePage: [],
      elements: [action("FADE IN THE DISTANCE")],
    });
  });

  it("reconstructs a scene heading wrapped at the established Action measure", () => {
    const input = normalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "INT. GOLDEN GATE BRIDGE, MINUTES ",
            x: 108,
            y: 700,
            width: 396,
            styles: ["bold"],
          },
          {
            text: "LATER",
            x: 108,
            y: 688,
            width: 36,
            styles: ["bold"],
          },
          {
            text: "The car crosses the bridge.",
            x: 108,
            y: 664,
            width: 190,
          },
        ],
      },
    ]);

    expect(recognizeScreenplay(input, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        scene("INT. GOLDEN GATE BRIDGE, MINUTES LATER"),
        action("The car crosses the bridge."),
      ],
    });
  });

  it("preserves deliberate short dialogue lines while joining ordinary PDF wraps", () => {
    const input = normalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "MARA", x: 252, y: 700, width: 35 },
          {
            text: "This ordinary dialogue reaches the established dialogue",
            x: 180,
            y: 688,
            width: 360,
          },
          {
            text: "measure and continues as one paragraph.",
            x: 180,
            y: 676,
            width: 266,
          },
          { text: "SINGER", x: 252, y: 640, width: 42 },
          {
            text: "First deliberate line.",
            x: 180,
            y: 628,
            width: 154,
            styles: ["italic"],
          },
          {
            text: "Second deliberate line.",
            x: 180,
            y: 616,
            width: 161,
            styles: ["italic"],
          },
        ],
      },
    ]);
    const italicWrappedInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "SINGER", x: 252, y: 700, width: 42 },
          {
            text: "This ordinary italic dialogue reaches the established dialogue",
            x: 180,
            y: 688,
            width: 360,
            styles: ["italic"],
          },
          {
            text: "measure and continues as one paragraph.",
            x: 180,
            y: 676,
            width: 266,
            styles: ["italic"],
          },
        ],
      },
    ]);
    const establishedStanzaInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "SINGER", x: 252, y: 700, width: 42 },
          {
            text: "First short line.",
            x: 180,
            y: 688,
            width: 120,
            styles: ["italic"],
          },
          {
            text: "Second short line.",
            x: 180,
            y: 676,
            width: 120,
            styles: ["italic"],
          },
          {
            text: "This emphasized sentence nearly fills the dialogue measure.",
            x: 180,
            y: 664,
            width: 350,
            styles: ["italic"],
          },
          {
            text: "Another verse begins and wraps across the dialogue",
            x: 180,
            y: 652,
            width: 360,
            styles: ["italic"],
          },
          {
            text: "measure.",
            x: 180,
            y: 640,
            width: 60,
            styles: ["italic"],
          },
        ],
      },
    ]);

    expect(recognizeScreenplay(input, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        {
          type: "character",
          text: styled(run("MARA")),
        },
        {
          type: "dialogue",
          text: styled(
            run(
              "This ordinary dialogue reaches the established dialogue measure and continues as one paragraph.",
            ),
          ),
        },
        {
          type: "character",
          text: styled(run("SINGER")),
        },
        {
          type: "dialogue",
          text: styled(
            run("First deliberate line.\nSecond deliberate line.", [
              "italic",
            ]),
          ),
        },
      ],
    });
    expect(recognizeScreenplay(italicWrappedInput, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        {
          type: "character",
          text: styled(run("SINGER")),
        },
        {
          type: "dialogue",
          text: styled(
            run(
              "This ordinary italic dialogue reaches the established dialogue measure and continues as one paragraph.",
              ["italic"],
            ),
          ),
        },
      ],
    });
    expect(recognizeScreenplay(establishedStanzaInput, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        {
          type: "character",
          text: styled(run("SINGER")),
        },
        {
          type: "dialogue",
          text: styled(
            run(
              "First short line.\nSecond short line.\nThis emphasized sentence nearly fills the dialogue measure.\nAnother verse begins and wraps across the dialogue measure.",
              ["italic"],
            ),
          ),
        },
      ],
    });
  });

  it("joins only evidence-supported Action continuation across a physical page boundary", () => {
    const continuousInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "A continuous Action line reaches the physical page edge and",
            x: 108,
            y: 36,
            width: 396,
          },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          {
            text: "continues without a paragraph break.",
            x: 108,
            y: 720,
            width: 252,
          },
        ],
      },
    ]);
    const separateInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "A complete Action paragraph ends at the page edge.",
            x: 108,
            y: 36,
            width: 396,
          },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          {
            text: "A separate Action paragraph begins on the next page.",
            x: 108,
            y: 720,
            width: 360,
          },
        ],
      },
    ]);
    const dashContinuousInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "An earlier complete Action paragraph.",
            x: 108,
            y: 100,
            width: 396,
          },
          {
            text: "A short continuing fragment -",
            x: 108,
            y: 36,
            width: 120,
          },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          {
            text: "- resumes at the next retained page edge.",
            x: 108,
            y: 720,
            width: 300,
          },
        ],
      },
    ]);

    expect(recognizeScreenplay(continuousInput, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        action(
          "A continuous Action line reaches the physical page edge and continues without a paragraph break.",
        ),
      ],
    });
    expect(recognizeScreenplay(separateInput, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        action("A complete Action paragraph ends at the page edge."),
        action("A separate Action paragraph begins on the next page."),
      ],
    });
    expect(recognizeScreenplay(dashContinuousInput, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        action("An earlier complete Action paragraph."),
        action(
          "A short continuing fragment -- resumes at the next retained page edge.",
        ),
      ],
    });
  });

  it("preserves adjacent inset Action lines as one multiline block", () => {
    const input = normalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "The card contains a handwritten address:",
            x: 108,
            y: 700,
            width: 420,
          },
          { text: "First handwritten line", x: 162, y: 676 },
          { text: "Second handwritten line", x: 162, y: 664 },
          { text: "Third handwritten line", x: 162, y: 652 },
          {
            text: "Scott picks up the phone.",
            x: 108,
            y: 628,
            width: 420,
          },
        ],
      },
    ]);

    expect(recognizeScreenplay(input, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        action("The card contains a handwritten address:"),
        action(
          "First handwritten line\nSecond handwritten line\nThird handwritten line",
        ),
        action("Scott picks up the phone."),
      ],
    });
  });

  it("detects scene numbers from left, right, and bilateral fragments", () => {
    const input = normalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "0", x: 54, y: 724 },
          { text: "OVER BLACK:", x: 108, y: 724 },
          { text: "1A", x: 54, y: 700 },
          { text: "EXT. FIELD - MORNING", x: 108, y: 700 },
          { text: "INT. HOUSE - DAY", x: 108, y: 676 },
          { text: "2", x: 540, y: 676 },
          { text: "3", x: 54, y: 652 },
          { text: "EXT. ROAD - NIGHT", x: 108, y: 652 },
          { text: "3", x: 540, y: 652 },
          { text: "They cross the field.", x: 108, y: 628 },
        ],
      },
    ]);

    expect(recognizeScreenplay(input, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        {
          type: "scene-heading",
          text: {
            runs: [{ text: "OVER BLACK:", styles: [] }],
          },
          sceneNumber: "0",
        },
        {
          type: "scene-heading",
          text: {
            runs: [{ text: "EXT. FIELD - MORNING", styles: [] }],
          },
          sceneNumber: "1A",
        },
        {
          type: "scene-heading",
          text: {
            runs: [{ text: "INT. HOUSE - DAY", styles: [] }],
          },
          sceneNumber: "2",
        },
        {
          type: "scene-heading",
          text: {
            runs: [{ text: "EXT. ROAD - NIGHT", styles: [] }],
          },
          sceneNumber: "3",
        },
        action("They cross the field."),
      ],
    });
  });

  it("uses the document sentence-spacing convention only at physical-wrap joins", () => {
    const oneSpaceInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "Observable sentence. Next sentence.",
            x: 108,
            y: 700,
            width: 396,
          },
          {
            text: "Sentence. ",
            x: 108,
            y: 676,
            width: 180,
            styles: ["bold"],
          },
          {
            text: "Next line.",
            x: 108,
            y: 664,
            width: 120,
          },
        ],
      },
    ]);
    const twoSpaceInput = normalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "Observable sentence.  Next sentence.",
            x: 108,
            y: 700,
            width: 396,
          },
          {
            text: "Sentence. ",
            x: 108,
            y: 676,
            width: 180,
            styles: ["bold"],
          },
          {
            text: "Next line.",
            x: 108,
            y: 664,
            width: 120,
          },
          {
            text: "Use e.g. ",
            x: 108,
            y: 640,
            width: 180,
          },
          {
            text: "an example.",
            x: 108,
            y: 628,
            width: 120,
          },
        ],
      },
    ]);

    expect(recognizeScreenplay(oneSpaceInput, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        action("Observable sentence. Next sentence."),
        action(
          styled(
            run("Sentence. ", ["bold"]),
            run("Next line."),
          ),
        ),
      ],
    });
    expect(recognizeScreenplay(twoSpaceInput, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        action("Observable sentence.  Next sentence."),
        action(
          styled(
            run("Sentence. ", ["bold"]),
            run(" Next line."),
          ),
        ),
        action("Use e.g. an example."),
      ],
    });
  });
});
