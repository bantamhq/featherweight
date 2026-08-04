import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  groupPositionedTextIntoPhysicalLines,
  type PhysicalTextLine,
  type PhysicalTextSpan,
} from "../../src/core/physical-lines.js";
import { extractPositionedPdfText } from "../../src/pdf/extraction/pdf-inspector.js";

const screenplayPdfUrl = new URL("../brick-and-steel.pdf", import.meta.url);
const positionedText = extractPositionedPdfText(readFileSync(screenplayPdfUrl));
const physicalText = groupPositionedTextIntoPhysicalLines(positionedText);

function findLineBySourceIndex(sourceIndex: number): PhysicalTextLine {
  return physicalText.lines.find((line) =>
    line.spans.some((span) => span.sourceIndex === sourceIndex),
  )!;
}

function summarizeSpans(spans: readonly PhysicalTextSpan[]) {
  return spans.map(({ sourceIndex, start, end, style }) => ({
    sourceIndex,
    start,
    end,
    style,
  }));
}

describe("groupPositionedTextIntoPhysicalLines", () => {
  it("joins contiguous styled runs into exact physical lines", () => {
    const permanentlyLine = findLineBySourceIndex(49);

    expect(permanentlyLine.pageIndex).toBe(2);
    expect(permanentlyLine.text).toBe("Permanently.");
    expect(permanentlyLine.bounds.x).toBeCloseTo(180);
    expect(permanentlyLine.bounds.y).toBeCloseTo(690.9186401367188);
    expect(permanentlyLine.bounds.width).toBeCloseTo(86.38800048828125);
    expect(permanentlyLine.bounds.height).toBeCloseTo(12);
    expect(summarizeSpans(permanentlyLine.spans)).toEqual([
      {
        sourceIndex: 49,
        start: 0,
        end: 11,
        style: {
          bold: false,
          italic: false,
          underline: true,
          strikeout: false,
        },
      },
      {
        sourceIndex: 50,
        start: 11,
        end: 12,
        style: {
          bold: false,
          italic: false,
          underline: false,
          strikeout: false,
        },
      },
    ]);

    const approachingLine = findLineBySourceIndex(63);

    expect(approachingLine.text).toBe(
      "From what seems like only INCHES AWAY.  Steel's face FILLS",
    );
    expect(summarizeSpans(approachingLine.spans)).toEqual([
      {
        sourceIndex: 63,
        start: 0,
        end: 40,
        style: {
          bold: false,
          italic: false,
          underline: false,
          strikeout: false,
        },
      },
      {
        sourceIndex: 64,
        start: 40,
        end: 58,
        style: {
          bold: false,
          italic: false,
          underline: true,
          strikeout: false,
        },
      },
    ]);

    const scopeLine = findLineBySourceIndex(65);

    expect(scopeLine.text).toBe("the Leupold Mark 4 scope.");
    expect(summarizeSpans(scopeLine.spans)).toEqual([
      {
        sourceIndex: 65,
        start: 0,
        end: 4,
        style: {
          bold: false,
          italic: false,
          underline: true,
          strikeout: false,
        },
      },
      {
        sourceIndex: 66,
        start: 4,
        end: 18,
        style: {
          bold: false,
          italic: true,
          underline: true,
          strikeout: false,
        },
      },
      {
        sourceIndex: 67,
        start: 18,
        end: 24,
        style: {
          bold: false,
          italic: false,
          underline: true,
          strikeout: false,
        },
      },
      {
        sourceIndex: 68,
        start: 24,
        end: 25,
        style: {
          bold: false,
          italic: false,
          underline: false,
          strikeout: false,
        },
      },
    ]);
  });

  it("keeps disconnected dual-dialogue columns as separate physical lines", () => {
    const dualDialogueSourceIndexes = new Set([32, 33, 34, 35]);
    const dualDialogueLines = physicalText.lines
      .filter((line) =>
        line.spans.some((span) =>
          dualDialogueSourceIndexes.has(span.sourceIndex),
        ),
      )
      .map((line) => ({
        text: line.text,
        sourceIndexes: line.spans.map((span) => span.sourceIndex),
      }));

    expect(dualDialogueLines).toEqual([
      { text: "STEEL", sourceIndexes: [32] },
      { text: "BRICK", sourceIndexes: [33] },
      { text: "Screw retirement.", sourceIndexes: [34] },
      { text: "Screw retirement.", sourceIndexes: [35] },
    ]);
  });

  it("accounts for every extracted source item across page-scoped lines", () => {
    const sourceItemsByIndex = new Map(
      positionedText.items.map((item) => [item.sourceIndex, item]),
    );
    const pageLineCounts = Array.from({ length: 5 }, (_, pageIndex) =>
      physicalText.lines.filter((line) => line.pageIndex === pageIndex).length,
    );
    const flattenedSourceIndexes = physicalText.lines.flatMap((line) =>
      line.spans.map((span) => span.sourceIndex),
    );

    expect(physicalText.lines).toHaveLength(121);
    expect(pageLineCounts).toEqual([9, 37, 34, 35, 6]);
    expect(flattenedSourceIndexes).toEqual(
      Array.from({ length: 126 }, (_, sourceIndex) => sourceIndex),
    );

    for (const line of physicalText.lines) {
      for (const span of line.spans) {
        const sourceItem = sourceItemsByIndex.get(span.sourceIndex)!;

        expect(line.pageIndex).toBe(sourceItem.pageIndex);
        expect(line.text.slice(span.start, span.end)).toBe(sourceItem.text);
        expect(span.sourceMethod).toBe(sourceItem.sourceMethod);
        expect(span.bounds).toEqual(sourceItem.bounds);
        expect(span.font).toEqual(sourceItem.font);
        expect(span.style).toEqual(sourceItem.style);
      }
    }
  });
});
