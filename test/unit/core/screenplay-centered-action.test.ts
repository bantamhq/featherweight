import { describe, expect, it } from "vitest";

import type { ScreenplayLayout } from "../../../src/core/layout/screenplay-layout.js";
import type { NormalizedText } from "../../../src/core/normalized-text.js";
import type { PhysicalTextLine } from "../../../src/core/physical-lines.js";
import { recognizeScreenplay } from "../../../src/core/recognition/recognize-screenplay.js";
import { action } from "../../fixtures/semantic/document-builders.js";

interface OwnedLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

const establishedLayout: ScreenplayLayout = {
  action: { alignment: "left", x: 100 },
  characterCue: { alignment: "left", x: 240 },
  dialogue: { alignment: "left", x: 176 },
  parenthetical: { alignment: "left", x: 210 },
  transition: { alignment: "right", x: 406 },
  dualDialogue: null,
  diagnostics: [],
};

const nullLayout: ScreenplayLayout = {
  action: null,
  characterCue: null,
  dialogue: null,
  parenthetical: null,
  transition: null,
  dualDialogue: null,
  diagnostics: [],
};

function physicalLine(line: OwnedLine, sourceIndex: number): PhysicalTextLine {
  const bounds = { x: line.x, y: line.y, width: line.width, height: 12 };

  return {
    pageIndex: 0,
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
          bold: false,
          italic: false,
          underline: false,
          strikeout: false,
        },
      },
    ],
  };
}

function normalizedText(lines: readonly OwnedLine[]): NormalizedText {
  return {
    pages: [
      {
        pageIndex: 0,
        lines: lines.map(physicalLine),
      },
    ],
    suppressed: [],
    diagnostics: [],
  };
}

describe("centered Action recognition", () => {
  it("does not center fallback text at established screenplay-role geometry", () => {
    const input = normalizedText([
      { text: "orphan cue text", x: 240, y: 700, width: 116 },
      { text: "orphan dialogue fragment", x: 176, y: 676, width: 244 },
      { text: "orphan parenthetical fragment", x: 210, y: 652, width: 176 },
      { text: "orphan transition fragment", x: 190, y: 628, width: 216 },
      { text: "CENTERED SINGLE", x: 268, y: 604, width: 60 },
      { text: "CENTERED FIRST", x: 280, y: 580, width: 100 },
      { text: "CENTERED SECOND", x: 294, y: 568, width: 72 },
    ]);

    expect(recognizeScreenplay(input, establishedLayout)).toEqual({
      titlePage: [],
      elements: [
        action("orphan cue text"),
        action("orphan dialogue fragment"),
        action("orphan parenthetical fragment"),
        action("orphan transition fragment"),
        action("CENTERED SINGLE", "center"),
        action("CENTERED FIRST\nCENTERED SECOND", "center"),
      ],
    });
  });

  it("keeps every retained line as standard Action when the action layout is null", () => {
    const input = normalizedText([
      { text: "unattributable first", x: 268, y: 700, width: 60 },
      { text: "unattributable second", x: 280, y: 676, width: 100 },
    ]);

    expect(recognizeScreenplay(input, nullLayout)).toEqual({
      titlePage: [],
      elements: [
        action("unattributable first"),
        action("unattributable second"),
      ],
    });
  });
});
