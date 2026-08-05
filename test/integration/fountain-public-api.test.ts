import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { screenplayToFountain } from "../../src/index.js";
import type {
  Action,
  Character,
  Dialogue,
  DialogueSequence,
  DualDialogue,
  Lyric,
  PageBreak,
  Parenthetical,
  SceneHeading,
  ScreenplayDocument,
  ScreenplayElement,
  StyledText,
  TextRun,
  TextStyle,
  TitlePageField,
  Transition,
} from "../../src/index.js";
import { brickAndSteelDocument } from "../fixtures/semantic/brick-and-steel-document.js";
import { normalizationGauntletDocument } from "../fixtures/semantic/normalization-gauntlet-document.js";

type PublicSemanticSurface = readonly [
  ScreenplayDocument,
  TitlePageField,
  StyledText,
  TextRun,
  TextStyle,
  ScreenplayElement,
  SceneHeading,
  Action,
  Character,
  Parenthetical,
  Dialogue,
  DualDialogue,
  DialogueSequence,
  Lyric,
  Transition,
  PageBreak,
];

describe("screenplayToFountain public API", () => {
  it("serializes Brick & Steel to its complete canonical Fountain document", () => {
    const expected = readGolden("brick-and-steel.expected.fountain");

    expect(screenplayToFountain(brickAndSteelDocument)).toBe(expected);
  });

  it("serializes Normalization Gauntlet to its complete canonical Fountain document", () => {
    const expected = readGolden("normalization-gauntlet.expected.fountain");

    expect(screenplayToFountain(normalizationGauntletDocument)).toBe(expected);
  });
});

function readGolden(fixtureName: string): string {
  return readFileSync(
    new URL(`../fixtures/fountain/${fixtureName}`, import.meta.url),
    "utf8",
  );
}
