import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  groupPositionedTextIntoPhysicalLines,
  type PhysicalText,
  type PhysicalTextLine,
} from "../../src/core/physical-lines.js";
import type {
  NormalizedText,
  SuppressedPhysicalTextLine,
} from "../../src/core/normalized-text.js";
import { extractPositionedPdfText } from "../../src/pdf/extraction/pdf-inspector.js";
import { normalizePhysicalText } from "../../src/pdf/normalization/physical-text.js";

const cleanGauntletPdfUrl = new URL(
  "../normalization-gauntlet-clean.pdf",
  import.meta.url,
);
const markedGauntletPdfUrl = new URL(
  "../normalization-gauntlet-artifacts.pdf",
  import.meta.url,
);
const brickAndSteelPdfUrl = new URL("../brick-and-steel.pdf", import.meta.url);

function extractPhysicalText(pdfUrl: URL): PhysicalText {
  return groupPositionedTextIntoPhysicalLines(
    extractPositionedPdfText(readFileSync(pdfUrl)),
  );
}

function findLine(
  physicalText: PhysicalText,
  pageIndex: number,
  text: string,
): PhysicalTextLine {
  const matchingLines = physicalText.lines.filter(
    (line) => line.pageIndex === pageIndex && line.text === text,
  );

  expect(matchingLines).toHaveLength(1);
  return matchingLines[0]!;
}

function findTopLine(
  physicalText: PhysicalText,
  pageIndex: number,
  text: string,
): PhysicalTextLine {
  const matchingLines = physicalText.lines.filter(
    (line) => line.pageIndex === pageIndex && line.text === text,
  );

  expect(matchingLines.length).toBeGreaterThan(0);
  return matchingLines.reduce((topLine, line) =>
    line.bounds.y > topLine.bounds.y ? line : topLine,
  );
}

function activeLines(normalizedText: NormalizedText): PhysicalTextLine[] {
  return normalizedText.pages.flatMap((page) => page.lines);
}

function expectExactActiveLines(
  physicalText: PhysicalText,
  normalizedText: NormalizedText,
  expectedSuppressed: readonly SuppressedPhysicalTextLine[],
): void {
  const expectedSuppressedLines = new Set(
    expectedSuppressed.map((record) => record.line),
  );
  const expectedActiveLines = physicalText.lines.filter(
    (line) => !expectedSuppressedLines.has(line),
  );

  expect(activeLines(normalizedText)).toEqual(expectedActiveLines);
}

function expectExactSuppressedRecords(
  actual: readonly SuppressedPhysicalTextLine[],
  expected: readonly SuppressedPhysicalTextLine[],
): void {
  expect(actual).toHaveLength(expected.length);

  for (let index = 0; index < expected.length; index += 1) {
    const actualRecord = actual[index]!;
    const expectedRecord = expected[index]!;

    expect(actualRecord.line).toEqual(expectedRecord.line);
    expect(actualRecord.reasons).toHaveLength(expectedRecord.reasons.length);
    expect(actualRecord.reasons).toEqual(
      expect.arrayContaining([...expectedRecord.reasons]),
    );
  }
}

function orderedNonWhitespaceTokens(
  lines: readonly PhysicalTextLine[],
): string[] {
  return lines.flatMap((line) => line.text.match(/\S+/g) ?? []);
}

function expectOrderedPages(
  normalizedText: NormalizedText,
  expectedPageIndexes: readonly number[],
): void {
  expect(normalizedText.pages.map((page) => page.pageIndex)).toEqual(
    expectedPageIndexes,
  );

  for (const page of normalizedText.pages) {
    expect(page.lines.every((line) => line.pageIndex === page.pageIndex)).toBe(
      true,
    );
  }
}

describe("normalizePhysicalText", () => {
  it("recovers equal active screenplays from clean and marked exports", () => {
    const cleanPhysicalText = extractPhysicalText(cleanGauntletPdfUrl);
    const markedPhysicalText = extractPhysicalText(markedGauntletPdfUrl);
    const cleanResult: NormalizedText = normalizePhysicalText(
      cleanPhysicalText,
    );
    const markedResult: NormalizedText = normalizePhysicalText(
      markedPhysicalText,
    );
    const screenplayPagination = ["screenplay-pagination"] as const;
    const recurringArtifact = ["recurring-page-artifact"] as const;
    const recurringPagination = [
      "recurring-page-artifact",
      "screenplay-pagination",
    ] as const;
    const sourcePageNumber = ["source-page-number"] as const;

    const expectedCleanSuppressed: readonly SuppressedPhysicalTextLine[] = [
      {
        line: findTopLine(cleanPhysicalText, 3, "NOAH"),
        reasons: screenplayPagination,
      },
      {
        line: findTopLine(cleanPhysicalText, 5, "NOAH"),
        reasons: screenplayPagination,
      },
    ];
    const expectedMarkedSuppressed: readonly SuppressedPhysicalTextLine[] = [
      {
        line: findLine(markedPhysicalText, 1, "NORMALIZATION FIXTURE"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 1, "REVIEW COPY"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 1, "(CONTINUED)"),
        reasons: screenplayPagination,
      },
      {
        line: findLine(markedPhysicalText, 1, "FEATHERWEIGHT TEST"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(
          markedPhysicalText,
          2,
          "CONTINUED: (2)               NORMALIZATION FIXTURE",
        ),
        reasons: recurringPagination,
      },
      {
        line: findLine(markedPhysicalText, 2, "2."),
        reasons: sourcePageNumber,
      },
      {
        line: findLine(markedPhysicalText, 2, "REVIEW COPY"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 2, "(MORE)"),
        reasons: screenplayPagination,
      },
      {
        line: findLine(markedPhysicalText, 2, "FEATHERWEIGHT TEST"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 2, "(CONTINUED)"),
        reasons: screenplayPagination,
      },
      {
        line: findLine(
          markedPhysicalText,
          3,
          "CONTINUED: (2)               NORMALIZATION FIXTURE",
        ),
        reasons: recurringPagination,
      },
      {
        line: findLine(markedPhysicalText, 3, "3."),
        reasons: sourcePageNumber,
      },
      {
        line: findLine(markedPhysicalText, 3, "NOAH (CONT'D)"),
        reasons: screenplayPagination,
      },
      {
        line: findLine(markedPhysicalText, 3, "REVIEW COPY"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 3, "(CONTINUED)"),
        reasons: screenplayPagination,
      },
      {
        line: findLine(markedPhysicalText, 3, "FEATHERWEIGHT TEST"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(
          markedPhysicalText,
          4,
          "CONTINUED: (2)               NORMALIZATION FIXTURE",
        ),
        reasons: recurringPagination,
      },
      {
        line: findLine(markedPhysicalText, 4, "4."),
        reasons: sourcePageNumber,
      },
      {
        line: findLine(markedPhysicalText, 4, "REVIEW COPY"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 4, "(MORE)"),
        reasons: screenplayPagination,
      },
      {
        line: findLine(markedPhysicalText, 4, "FEATHERWEIGHT TEST"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 4, "(CONTINUED)"),
        reasons: screenplayPagination,
      },
      {
        line: findLine(
          markedPhysicalText,
          5,
          "CONTINUED: (3)               NORMALIZATION FIXTURE",
        ),
        reasons: recurringPagination,
      },
      {
        line: findLine(markedPhysicalText, 5, "5."),
        reasons: sourcePageNumber,
      },
      {
        line: findLine(markedPhysicalText, 5, "NOAH (CONT'D)"),
        reasons: screenplayPagination,
      },
      {
        line: findLine(markedPhysicalText, 5, "REVIEW COPY"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 5, "FEATHERWEIGHT TEST"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 5, "(CONTINUED)"),
        reasons: screenplayPagination,
      },
      {
        line: findLine(
          markedPhysicalText,
          6,
          "CONTINUED: (4)               NORMALIZATION FIXTURE",
        ),
        reasons: recurringPagination,
      },
      {
        line: findLine(markedPhysicalText, 6, "6."),
        reasons: sourcePageNumber,
      },
      {
        line: findLine(markedPhysicalText, 6, "REVIEW COPY"),
        reasons: recurringArtifact,
      },
      {
        line: findLine(markedPhysicalText, 6, "FEATHERWEIGHT TEST"),
        reasons: recurringArtifact,
      },
    ];

    expectExactSuppressedRecords(
      cleanResult.suppressed,
      expectedCleanSuppressed,
    );
    expectExactSuppressedRecords(
      markedResult.suppressed,
      expectedMarkedSuppressed,
    );
    expectExactActiveLines(
      cleanPhysicalText,
      cleanResult,
      expectedCleanSuppressed,
    );
    expectExactActiveLines(
      markedPhysicalText,
      markedResult,
      expectedMarkedSuppressed,
    );
    expect(orderedNonWhitespaceTokens(activeLines(markedResult))).toEqual(
      orderedNonWhitespaceTokens(activeLines(cleanResult)),
    );
    expectOrderedPages(cleanResult, [0, 1, 2, 3, 4, 5, 6]);
    expectOrderedPages(markedResult, [0, 1, 2, 3, 4, 5, 6]);
    expect(cleanResult.diagnostics).toEqual([]);
    expect(markedResult.diagnostics).toEqual([]);
  });

  it("removes only source page numbers from Brick & Steel", () => {
    const physicalText = extractPhysicalText(brickAndSteelPdfUrl);
    const result: NormalizedText = normalizePhysicalText(physicalText);
    const expectedSuppressed: readonly SuppressedPhysicalTextLine[] = [
      {
        line: findLine(physicalText, 2, "2."),
        reasons: ["source-page-number"],
      },
      {
        line: findLine(physicalText, 3, "3."),
        reasons: ["source-page-number"],
      },
      {
        line: findLine(physicalText, 4, "4."),
        reasons: ["source-page-number"],
      },
    ];

    expectExactSuppressedRecords(result.suppressed, expectedSuppressed);
    expectExactActiveLines(
      physicalText,
      result,
      expectedSuppressed,
    );
    expectOrderedPages(result, [0, 1, 2, 3, 4]);
    expect(result.diagnostics).toEqual([]);
  });
});
