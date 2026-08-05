import { describe, expect, it } from "vitest";

import type {
  PhysicalText,
  PhysicalTextLine,
} from "../../../src/core/physical-lines.js";
import type { NormalizedText } from "../../../src/core/normalized-text.js";
import { normalizePhysicalText } from "../../../src/pdf/normalization/physical-text.js";

const courierFont = { name: "Courier Prime", size: 12 } as const;
const plainStyle = {
  bold: false,
  italic: false,
  underline: false,
  strikeout: false,
} as const;

function createPhysicalLine(
  sourceIndex: number,
  pageIndex: number,
  text: string,
  x: number,
  y: number,
): PhysicalTextLine {
  const bounds = {
    x,
    y,
    width: text.length * 7.2,
    height: 12,
  };

  return {
    pageIndex,
    text,
    bounds,
    spans: [
      {
        start: 0,
        end: text.length,
        sourceIndex,
        sourceMethod: "embedded-text",
        bounds,
        font: courierFont,
        style: plainStyle,
      },
    ],
  };
}

describe("normalizePhysicalText", () => {
  it("retains and diagnoses a pagination marker away from the page boundary", () => {
    const ambiguousMoreLine = createPhysicalLine(3, 0, "(MORE)", 216, 360);
    const physicalText: PhysicalText = {
      lines: [
        createPhysicalLine(0, 0, "INT. ARCHIVE - NIGHT", 108, 720),
        createPhysicalLine(1, 0, "MARA", 252, 660),
        createPhysicalLine(2, 0, "The signal repeats.", 108, 612),
        ambiguousMoreLine,
        createPhysicalLine(4, 0, "8/3/2026", 108, 300),
        createPhysicalLine(5, 0, "Go.", 108, 252),
        createPhysicalLine(6, 0, "The bottom action remains.", 108, 84),
        createPhysicalLine(7, 1, "INT. ARCHIVE - LATER", 108, 720),
        createPhysicalLine(8, 1, "The signal repeats.", 108, 576),
        createPhysicalLine(9, 1, "CUT TO:", 468, 300),
        createPhysicalLine(10, 1, "The final action remains.", 108, 84),
      ],
    };
    const result: NormalizedText = normalizePhysicalText(physicalText);
    const activeMoreLine = result.pages
      .flatMap((page) => page.lines)
      .find((line) => line.spans.some((span) => span.sourceIndex === 3));

    expect(activeMoreLine).toEqual(ambiguousMoreLine);
    expect(result.suppressed).not.toContainEqual(
      expect.objectContaining({ line: ambiguousMoreLine }),
    );
    expect(result.diagnostics).toEqual([
      {
        code: "AMBIGUOUS_PAGE_ARTIFACT",
        pageIndex: 0,
        sourceIndexes: [3],
        candidateReasons: ["screenplay-pagination"],
      },
    ]);
  });

  it.each([
    ["MARK (V.O.)", "MARK (V.O.) (CONT’D)"],
    ["MARK (VO)", "MARK (VO) (CONT'D)"],
    ["MARK (V.O.)", "MARK (V.O.) (cont’d)"],
  ])(
    "suppresses a page-local MORE from %s with generated cue %s",
    (ordinaryCueText, continuedCueText) => {
      const moreLine = createPhysicalLine(3, 0, "(MORE)", 216, 300);
      const continuedCueLine = createPhysicalLine(
        4,
        1,
        continuedCueText,
        252,
        720,
      );
      const physicalText: PhysicalText = {
        lines: [
          createPhysicalLine(0, 0, "INT. OFFICE - NIGHT", 108, 720),
          createPhysicalLine(1, 0, ordinaryCueText, 252, 348),
          createPhysicalLine(2, 0, "The thought continues.", 180, 336),
          moreLine,
          continuedCueLine,
          createPhysicalLine(5, 1, "over speakerphone", 180, 708),
          createPhysicalLine(6, 1, "The next scene continues.", 108, 84),
        ],
      };
      const result: NormalizedText = normalizePhysicalText(physicalText);

      expect(result.suppressed).toEqual([
        { line: moreLine, reasons: ["screenplay-pagination"] },
        { line: continuedCueLine, reasons: ["screenplay-pagination"] },
      ]);
      expect(result.pages.flatMap((page) => page.lines)).toEqual([
        physicalText.lines[0],
        physicalText.lines[1],
        physicalText.lines[2],
        physicalText.lines[5],
        physicalText.lines[6],
      ]);
      expect(result.diagnostics).toEqual([]);
    },
  );

  it("does not use an older cue when a nearer extended cue names another speaker", () => {
    const moreLine = createPhysicalLine(4, 0, "(MORE)", 216, 300);
    const continuedCueLine = createPhysicalLine(
      5,
      1,
      "MARK (V.O.) (CONT’D)",
      252,
      720,
    );
    const physicalText: PhysicalText = {
      lines: [
        createPhysicalLine(0, 0, "INT. OFFICE - NIGHT", 108, 720),
        createPhysicalLine(1, 0, "MARK", 252, 480),
        createPhysicalLine(2, 0, "RILEY (V.O.)", 252, 348),
        createPhysicalLine(3, 0, "The thought continues.", 180, 336),
        moreLine,
        continuedCueLine,
        createPhysicalLine(6, 1, "over speakerphone", 180, 708),
        createPhysicalLine(7, 1, "The next scene continues.", 108, 84),
      ],
    };
    const result: NormalizedText = normalizePhysicalText(physicalText);

    expect(result.suppressed).toEqual([]);
    expect(result.pages.flatMap((page) => page.lines)).toEqual(
      physicalText.lines,
    );
    expect(result.diagnostics).toEqual([
      {
        code: "AMBIGUOUS_PAGE_ARTIFACT",
        pageIndex: 0,
        sourceIndexes: [4],
        candidateReasons: ["screenplay-pagination"],
      },
      {
        code: "AMBIGUOUS_PAGE_ARTIFACT",
        pageIndex: 1,
        sourceIndexes: [5],
        candidateReasons: ["screenplay-pagination"],
      },
    ]);
  });
});
