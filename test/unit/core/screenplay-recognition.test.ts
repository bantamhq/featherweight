import { describe, expect, it } from "vitest";

import type { ScreenplayLayout } from "../../../src/core/layout/screenplay-layout.js";
import type { NormalizedText } from "../../../src/core/normalized-text.js";
import type { PhysicalTextLine } from "../../../src/core/physical-lines.js";
import type {
  PositionedTextFont,
  SourceMethod,
} from "../../../src/core/positioned-text.js";
import { recognizeScreenplay } from "../../../src/core/recognition/recognize-screenplay.js";
import type {
  ScreenplayDocument,
  TextStyle,
} from "../../../src/core/screenplay-document.js";
import {
  action,
  character,
  dialogue,
  dual,
  parenthetical,
  run,
  scene,
  sequence,
  styled,
} from "../../fixtures/semantic/document-builders.js";

const courierFont: PositionedTextFont = { name: "Courier Prime", size: 12 };
const embeddedTextSourceMethod: SourceMethod = "embedded-text";

interface OwnedSpan {
  readonly text: string;
  readonly styles?: readonly TextStyle[];
}

interface OwnedLine {
  readonly x: number;
  readonly y: number;
  readonly spans: readonly OwnedSpan[];
}

interface OwnedPage {
  readonly pageIndex: number;
  readonly lines: readonly OwnedLine[];
}

function line(text: string, x: number, y: number): OwnedLine {
  return { x, y, spans: [{ text }] };
}

function createPhysicalLine(
  sourceIndex: number,
  pageIndex: number,
  ownedLine: OwnedLine,
): PhysicalTextLine {
  const text = ownedLine.spans.map((span) => span.text).join("");
  const bounds = {
    x: ownedLine.x,
    y: ownedLine.y,
    width: text.length * 7.2,
    height: 12,
  };
  let start = 0;

  return {
    pageIndex,
    text,
    bounds,
    spans: ownedLine.spans.map((span) => {
      const end = start + span.text.length;
      const spanBounds = {
        x: ownedLine.x + start * 7.2,
        y: ownedLine.y,
        width: span.text.length * 7.2,
        height: 12,
      };
      const styles = span.styles ?? [];
      const physicalSpan = {
        start,
        end,
        sourceIndex,
        sourceMethod: embeddedTextSourceMethod,
        bounds: spanBounds,
        font: courierFont,
        style: {
          bold: styles.includes("bold"),
          italic: styles.includes("italic"),
          underline: styles.includes("underline"),
          strikeout: styles.includes("strikeout"),
        },
      };

      start = end;
      return physicalSpan;
    }),
  };
}

function createNormalizedText(pages: readonly OwnedPage[]): NormalizedText {
  let sourceIndex = 0;

  return {
    pages: pages.map((page) => ({
      pageIndex: page.pageIndex,
      lines: page.lines.map((ownedLine) =>
        createPhysicalLine(sourceIndex++, page.pageIndex, ownedLine),
      ),
    })),
    suppressed: [],
    diagnostics: [],
  };
}

const partialLayout: ScreenplayLayout = {
  action: null,
  characterCue: null,
  dialogue: null,
  parenthetical: null,
  transition: null,
  dualDialogue: null,
  diagnostics: [
    { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "action" },
    { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "character-cue" },
    { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "dialogue" },
    { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "parenthetical" },
    { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "transition" },
    { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "dual-dialogue" },
  ],
};

const standardLayout: ScreenplayLayout = {
  action: { alignment: "left", x: 108 },
  characterCue: { alignment: "left", x: 252 },
  dialogue: { alignment: "left", x: 180 },
  parenthetical: { alignment: "left", x: 216 },
  transition: { alignment: "right", x: 540 },
  dualDialogue: {
    left: {
      characterCue: { alignment: "left", x: 180 },
      dialogue: { alignment: "left", x: 144 },
    },
    right: {
      characterCue: { alignment: "left", x: 396 },
      dialogue: { alignment: "left", x: 360 },
    },
  },
  diagnostics: [],
};

describe("recognizeScreenplay", () => {
  it("associates visible scene-number fragments without decomposing the heading", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          line("12", 72, 700),
          {
            x: 108,
            y: 700,
            spans: [{ text: "INT. NUMBERED ROOM - NIGHT", styles: ["bold"] }],
          },
          line("12", 540, 700),
          line("A clock advances.", 108, 676),
        ],
      },
    ]);
    const expected: ScreenplayDocument = {
      titlePage: [],
      elements: [
        scene("INT. NUMBERED ROOM - NIGHT", "12"),
        action("A clock advances."),
      ],
    };

    expect(recognizeScreenplay(normalizedText, standardLayout)).toEqual(expected);
  });

  it("strips only a terminal ASCII continuation suffix from character cues", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          line("MARK (CONT'D)", 252, 700),
          line("First.", 180, 688),
          line("MARK (cont'd)", 252, 664),
          line("Second.", 180, 652),
          line("MARK (O.S.) (CONT'D)  ", 252, 628),
          line("Third.", 180, 616),
          line("MARK (CONTINUED)", 252, 592),
          line("Fourth.", 180, 580),
          line("MARK (CONT'D.)", 252, 556),
          line("Fifth.", 180, 544),
          line("MARK (CONT’D)", 252, 520),
          line("Sixth.", 180, 508),
          line("MARK (CONT'D) (V.O.)", 252, 484),
          line("Seventh.", 180, 472),
          line("NARRATOR", 252, 448),
          line("Dialogue ends (CONT'D)", 180, 436),
          line("Action ends (CONT'D)", 108, 412),
        ],
      },
    ]);
    const expected: ScreenplayDocument = {
      titlePage: [],
      elements: [
        character("MARK"),
        dialogue("First."),
        character("MARK"),
        dialogue("Second."),
        character("MARK (O.S.)"),
        dialogue("Third."),
        character("MARK (CONTINUED)"),
        dialogue("Fourth."),
        character("MARK (CONT'D.)"),
        dialogue("Fifth."),
        character("MARK (CONT’D)"),
        dialogue("Sixth."),
        character("MARK (CONT'D) (V.O.)"),
        dialogue("Seventh."),
        character("NARRATOR"),
        dialogue("Dialogue ends (CONT'D)"),
        action("Action ends (CONT'D)"),
      ],
    };

    expect(recognizeScreenplay(normalizedText, standardLayout)).toEqual(expected);
  });

  it("preserves strikeout, combined styles, punctuation, and physical-wrap joining", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            x: 108,
            y: 700,
            spans: [
              { text: "Signal " },
              { text: "vanishes", styles: ["strikeout"] },
              { text: " while " },
              {
                text: "three words",
                styles: ["bold", "italic", "underline"],
              },
            ],
          },
          line(", then returns.", 108, 688),
        ],
      },
    ]);
    const expected: ScreenplayDocument = {
      titlePage: [],
      elements: [
        action(
          styled(
            run("Signal "),
            run("vanishes", ["strikeout"]),
            run(" while "),
            run("three words", ["bold", "italic", "underline"]),
            run(", then returns."),
          ),
        ),
      ],
    };

    expect(recognizeScreenplay(normalizedText, standardLayout)).toEqual(expected);
  });

  it("falls back to Action across physical pages without inventing title fields or page breaks", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          line("Unattributable first-page text.", 162, 600),
          line("Another retained first-page line.", 126, 564),
        ],
      },
      {
        pageIndex: 1,
        lines: [line("Second-page retained text.", 126, 700)],
      },
    ]);
    const expected: ScreenplayDocument = {
      titlePage: [],
      elements: [
        action("Unattributable first-page text."),
        action("Another retained first-page line."),
        action("Second-page retained text."),
      ],
    };

    expect(recognizeScreenplay(normalizedText, partialLayout)).toEqual(expected);
  });

  it("reconstructs wrapped ordinary and lane-specific dual-dialogue content exactly once", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          line("MARA", 252, 700),
          line("(quietly, across", 216, 688),
          line("two lines)", 216, 676),
          line("Keep the ordinary", 180, 664),
          line("words together.", 180, 652),
          line("MARA", 180, 604),
          line("NOAH", 396, 604),
          line("(under the", 162, 592),
          line("Right opening.", 360, 592),
          line("same breath)", 162, 580),
          line("Right reply.", 360, 580),
          line("Left opening.", 144, 568),
          line("(right aside)", 378, 568),
          line("Left reply.", 144, 556),
          line("Right close.", 360, 556),
        ],
      },
    ]);
    const expected: ScreenplayDocument = {
      titlePage: [],
      elements: [
        character("MARA"),
        parenthetical("(quietly, across two lines)"),
        dialogue("Keep the ordinary words together."),
        dual(
          sequence(
            "MARA",
            parenthetical("(under the same breath)"),
            dialogue("Left opening. Left reply."),
          ),
          sequence(
            "NOAH",
            dialogue("Right opening. Right reply."),
            parenthetical("(right aside)"),
            dialogue("Right close."),
          ),
        ),
      ],
    };

    expect(recognizeScreenplay(normalizedText, standardLayout)).toEqual(expected);
  });

  it("returns an empty document for empty retained input", () => {
    const normalizedText = createNormalizedText([]);

    expect(recognizeScreenplay(normalizedText, partialLayout)).toEqual({
      titlePage: [],
      elements: [],
    });
  });
});
