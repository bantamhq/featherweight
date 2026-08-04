import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { inferScreenplayLayout } from "../../src/core/layout/infer-screenplay-layout.js";
import type {
  DualDialogueLayout,
  LayoutAnchor,
  LayoutDiagnostic,
  ScreenplayLayout,
} from "../../src/core/layout/screenplay-layout.js";
import { groupPositionedTextIntoPhysicalLines } from "../../src/core/physical-lines.js";
import type { NormalizedText } from "../../src/core/normalized-text.js";
import { extractPositionedPdfText } from "../../src/pdf/extraction/pdf-inspector.js";
import { normalizeNativePhysicalText } from "../../src/pdf/normalization/native-text.js";

const brickAndSteelPdfUrl = new URL("../brick-and-steel.pdf", import.meta.url);
const cleanGauntletPdfUrl = new URL(
  "../normalization-gauntlet-clean.pdf",
  import.meta.url,
);
const markedGauntletPdfUrl = new URL(
  "../normalization-gauntlet-artifacts.pdf",
  import.meta.url,
);

function extractNormalizedText(pdfUrl: URL): NormalizedText {
  const positionedText = extractPositionedPdfText(readFileSync(pdfUrl));
  const physicalText = groupPositionedTextIntoPhysicalLines(positionedText);

  return normalizeNativePhysicalText(physicalText);
}

function expectLeftAnchor(
  actual: LayoutAnchor | null,
  expectedX: number,
): void {
  expect(actual).not.toBeNull();
  expect(actual!.alignment).toBe("left");
  expect(Math.abs(actual!.x - expectedX)).toBeLessThanOrEqual(0.1);
}

function expectDualDialogue(
  actual: DualDialogueLayout | null,
  expected: {
    readonly leftCharacterCue: number;
    readonly leftDialogue: number;
    readonly rightCharacterCue: number;
    readonly rightDialogue: number;
  },
): void {
  expect(actual).not.toBeNull();
  expectLeftAnchor(actual!.left.characterCue, expected.leftCharacterCue);
  expectLeftAnchor(actual!.left.dialogue, expected.leftDialogue);
  expectLeftAnchor(actual!.right.characterCue, expected.rightCharacterCue);
  expectLeftAnchor(actual!.right.dialogue, expected.rightDialogue);
}

function expectDiagnostics(
  actual: readonly LayoutDiagnostic[],
  expected: readonly LayoutDiagnostic[],
): void {
  expect(actual).toHaveLength(expected.length);
  expect(actual).toEqual(expect.arrayContaining([...expected]));
}

function expectGauntletProfile(layout: ScreenplayLayout): void {
  expectLeftAnchor(layout.action, 108);
  expectLeftAnchor(layout.characterCue, 252);
  expectLeftAnchor(layout.dialogue, 180);
  expectLeftAnchor(layout.parenthetical, 216);
  expect(layout.transition).toBeNull();
  expectDualDialogue(layout.dualDialogue, {
    leftCharacterCue: 180,
    leftDialogue: 144,
    rightCharacterCue: 396,
    rightDialogue: 360,
  });
}

describe("inferScreenplayLayout", () => {
  it("infers the complete dominant profile from Brick & Steel", () => {
    const normalizedText = extractNormalizedText(brickAndSteelPdfUrl);
    const inputBeforeInference = structuredClone(normalizedText);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 108);
    expectLeftAnchor(result.characterCue, 252);
    expectLeftAnchor(result.dialogue, 180);
    expectLeftAnchor(result.parenthetical, 216);
    expect(result.transition).not.toBeNull();
    expect(result.transition!.alignment).toBe("right");
    expect(result.transition!.x).toBeGreaterThanOrEqual(547.0);
    expect(result.transition!.x).toBeLessThanOrEqual(547.2);
    expectDualDialogue(result.dualDialogue, {
      leftCharacterCue: 193.5,
      leftDialogue: 108,
      rightCharacterCue: 418.5,
      rightDialogue: 333,
    });
    expectDiagnostics(result.diagnostics, []);
    expect(normalizedText).toEqual(inputBeforeInference);
  });

  it("is invariant to normalized production markings", () => {
    const cleanNormalizedText = extractNormalizedText(cleanGauntletPdfUrl);
    const markedNormalizedText = extractNormalizedText(markedGauntletPdfUrl);
    const cleanInputBeforeInference = structuredClone(cleanNormalizedText);
    const markedInputBeforeInference = structuredClone(markedNormalizedText);

    const cleanResult = inferScreenplayLayout(cleanNormalizedText);
    const markedResult = inferScreenplayLayout(markedNormalizedText);

    expectGauntletProfile(cleanResult);
    expectGauntletProfile(markedResult);
    const expectedDiagnostics: readonly LayoutDiagnostic[] = [
      {
        code: "INSUFFICIENT_LAYOUT_EVIDENCE",
        role: "transition",
      },
    ];
    expectDiagnostics(cleanResult.diagnostics, expectedDiagnostics);
    expectDiagnostics(markedResult.diagnostics, expectedDiagnostics);
    expect(cleanNormalizedText).toEqual(cleanInputBeforeInference);
    expect(markedNormalizedText).toEqual(markedInputBeforeInference);
  });
});
