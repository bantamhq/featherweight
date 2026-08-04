import { describe, expect, it } from "vitest";

import { inferScreenplayLayout } from "../../../src/core/layout/infer-screenplay-layout.js";
import type {
  LayoutAnchor,
  LayoutDiagnostic,
} from "../../../src/core/layout/screenplay-layout.js";
import type { PhysicalTextLine } from "../../../src/core/physical-lines.js";
import type { NormalizedText } from "../../../src/core/normalized-text.js";

const courierFont = { name: "Courier Prime", size: 12 } as const;
const plainStyle = {
  bold: false,
  italic: false,
  underline: false,
  strikeout: false,
} as const;

interface OwnedLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

interface OwnedPage {
  readonly pageIndex: number;
  readonly lines: readonly OwnedLine[];
}

function createPhysicalLine(
  sourceIndex: number,
  pageIndex: number,
  { text, x, y }: OwnedLine,
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

function createNormalizedText(pages: readonly OwnedPage[]): NormalizedText {
  let sourceIndex = 0;

  return {
    pages: pages.map((page) => ({
      pageIndex: page.pageIndex,
      lines: page.lines.map((line) =>
        createPhysicalLine(sourceIndex++, page.pageIndex, line),
      ),
    })),
    suppressed: [],
    diagnostics: [],
  };
}

function expectLeftAnchor(
  actual: LayoutAnchor | null,
  expectedX: number,
): void {
  expect(actual).not.toBeNull();
  expect(actual!.alignment).toBe("left");
  expect(Math.abs(actual!.x - expectedX)).toBeLessThanOrEqual(0.1);
}

function expectDiagnostics(
  actual: readonly LayoutDiagnostic[],
  expected: readonly LayoutDiagnostic[],
): void {
  expect(actual).toHaveLength(expected.length);
  expect(actual).toEqual(expect.arrayContaining([...expected]));
}

const absentNonActionDiagnostics: readonly LayoutDiagnostic[] = [
  { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "character-cue" },
  { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "dialogue" },
  { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "parenthetical" },
  { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "transition" },
  { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "dual-dialogue" },
];

describe("inferScreenplayLayout", () => {
  it("returns honest partial evidence for an action-only screenplay", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [{ text: "A QUIET PAGE", x: 270, y: 540 }],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "Rain settles over the empty road.", x: 126, y: 700 },
          { text: "A porch light clicks off.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 2,
        lines: [
          { text: "Morning reaches the fields.", x: 126, y: 700 },
          { text: "A truck turns onto the highway.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 3,
        lines: [
          { text: "The farmhouse door opens.", x: 126, y: 700 },
          { text: "Someone steps into the daylight.", x: 126, y: 676 },
        ],
      },
    ]);
    const inputBeforeInference = structuredClone(normalizedText);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 126);
    expect(result.characterCue).toBeNull();
    expect(result.dialogue).toBeNull();
    expect(result.parenthetical).toBeNull();
    expect(result.transition).toBeNull();
    expect(result.dualDialogue).toBeNull();
    expectDiagnostics(result.diagnostics, absentNonActionDiagnostics);
    expect(normalizedText).toEqual(inputBeforeInference);
  });

  it("retains a dominant action origin while diagnosing coherent conflict", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "Clouds gather above the station.", x: 126, y: 700 },
          { text: "The platform remains empty.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "A distant signal changes.", x: 126, y: 700 },
          { text: "Rain reaches the tracks.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 2,
        lines: [
          { text: "The station clock advances.", x: 126, y: 700 },
          { text: "No train appears.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 3,
        lines: [
          {
            text: "Inside, the waiting room is dark.",
            x: 162,
            y: 700,
          },
          { text: "A lamp hums beside the door.", x: 162, y: 676 },
          { text: "Dust moves through its light.", x: 162, y: 652 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 126);
    expect(result.characterCue).toBeNull();
    expect(result.dialogue).toBeNull();
    expect(result.parenthetical).toBeNull();
    expect(result.transition).toBeNull();
    expect(result.dualDialogue).toBeNull();
    expectDiagnostics(result.diagnostics, [
      { code: "CONFLICTING_LAYOUT_EVIDENCE", role: "action" },
      ...absentNonActionDiagnostics,
    ]);
  });

  it("retains action conflict when the coherent minority appears first", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "Inside, the waiting room is dark.",
            x: 162,
            y: 700,
          },
          { text: "A lamp hums beside the door.", x: 162, y: 676 },
          { text: "Dust moves through its light.", x: 162, y: 652 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "Clouds gather above the station.", x: 126, y: 700 },
          { text: "The platform remains empty.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 2,
        lines: [
          { text: "A distant signal changes.", x: 126, y: 700 },
          { text: "Rain reaches the tracks.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 3,
        lines: [
          { text: "The station clock advances.", x: 126, y: 700 },
          { text: "No train appears.", x: 126, y: 676 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 126);
    expect(result.diagnostics).toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "action",
    });
  });

  it("retains dense first-page body evidence as a conflicting convention", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "Rain gathers beneath the awning.", x: 162, y: 700 },
          { text: "A bus passes the empty station.", x: 162, y: 676 },
          { text: "Water runs along the curb.", x: 162, y: 652 },
          { text: "The waiting room remains dark.", x: 162, y: 628 },
          { text: "A loose sign shifts overhead.", x: 162, y: 604 },
          { text: "Wind moves through the doorway.", x: 162, y: 580 },
          { text: "The station clock advances.", x: 162, y: 556 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "Clouds gather above the platform.", x: 126, y: 700 },
          { text: "The tracks remain empty.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 2,
        lines: [
          { text: "A distant signal changes.", x: 126, y: 700 },
          { text: "Rain reaches the rails.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 3,
        lines: [
          { text: "No train appears.", x: 126, y: 700 },
          { text: "Morning reaches the station.", x: 126, y: 676 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 126);
    expect(result.diagnostics).toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "action",
    });
  });

  it("returns a typed partial result for empty normalized text", () => {
    const normalizedText: NormalizedText = {
      pages: [],
      suppressed: [],
      diagnostics: [],
    };

    const result = inferScreenplayLayout(normalizedText);

    expect(result.action).toBeNull();
    expect(result.characterCue).toBeNull();
    expect(result.dialogue).toBeNull();
    expect(result.parenthetical).toBeNull();
    expect(result.transition).toBeNull();
    expect(result.dualDialogue).toBeNull();
    expectDiagnostics(result.diagnostics, [
      { code: "INSUFFICIENT_LAYOUT_EVIDENCE", role: "action" },
      ...absentNonActionDiagnostics,
    ]);
  });

  it("supports repeated transition right edges beyond unrelated body extents", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          {
            text: "The unusually long body line reaches beyond the transition edge.",
            x: 126,
            y: 700,
          },
          { text: "SHIFT:", x: 456.8, y: 676 },
          { text: "A new image fills the frame.", x: 126, y: 664 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          {
            text: "Another unusually long body line reaches beyond that same edge.",
            x: 126,
            y: 700,
          },
          { text: "LONG SHIFT:", x: 420.8, y: 676 },
          { text: "The image resolves into morning.", x: 126, y: 664 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expect(result.transition).not.toBeNull();
    expect(result.transition!.alignment).toBe("right");
    expect(Math.abs(result.transition!.x - 500)).toBeLessThanOrEqual(0.1);
    expectLeftAnchor(result.action, 126);
    expect(result.characterCue).toBeNull();
    expect(result.dialogue).toBeNull();
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "character-cue",
    });
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "dialogue",
    });
  });

  it("does not let transition evidence steal a cue and short dialogue", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "EDWARD", x: 252, y: 700 },
          { text: "No.", x: 180, y: 688 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.characterCue, 252);
    expectLeftAnchor(result.dialogue, 180);
    expect(result.action).toBeNull();
    expect(result.transition).toBeNull();
  });

  it("does not let transition evidence steal a cue-parenthetical-dialogue block", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "MARA", x: 252, y: 700 },
          { text: "(quietly)", x: 216, y: 688 },
          { text: "Wait.", x: 180, y: 676 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.characterCue, 252);
    expectLeftAnchor(result.dialogue, 180);
    expectLeftAnchor(result.parenthetical, 216);
    expect(result.action).toBeNull();
    expect(result.transition).toBeNull();
  });

  it("prefers coherent body-page action over a more numerous title-page origin", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "A WINTER STORY", x: 270, y: 700 },
          { text: "THE FIRST PART", x: 270, y: 676 },
          { text: "WRITTEN FOR THE SCREEN", x: 270, y: 652 },
          { text: "AN ORIGINAL DRAFT", x: 270, y: 628 },
          { text: "BY A CAREFUL WRITER", x: 270, y: 604 },
          { text: "SECOND REVISION", x: 270, y: 580 },
          { text: "AUGUST 2026", x: 270, y: 556 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "Rain moves through the orchard.", x: 126, y: 700 },
          { text: "A gate shifts in the wind.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 2,
        lines: [
          { text: "Morning reaches the empty barn.", x: 126, y: 700 },
          { text: "Dust turns in the doorway.", x: 126, y: 676 },
        ],
      },
      {
        pageIndex: 3,
        lines: [
          { text: "A truck crosses the lower field.", x: 126, y: 700 },
          { text: "The farmhouse remains dark.", x: 126, y: 676 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 126);
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "action",
    });
  });

  it("prefers short-screenplay body action over a more numerous title-page origin", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "A WINTER STORY", x: 270, y: 700 },
          { text: "AN ORIGINAL SCREENPLAY", x: 270, y: 676 },
          { text: "AUGUST 2026", x: 270, y: 652 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "Rain moves through the orchard.", x: 126, y: 700 },
          { text: "A gate shifts in the wind.", x: 126, y: 676 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 126);
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "action",
    });
  });

  it("prefers body action over an equal-count first-page title cluster", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "A WINTER STORY", x: 270, y: 700 },
          { text: "AUGUST 2026", x: 270, y: 676 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "Rain moves through the orchard.", x: 126, y: 700 },
          { text: "A gate shifts in the wind.", x: 126, y: 676 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 126);
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "action",
    });
  });

  it("prefers uppercase-only body action over a more numerous first-page origin", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "A WINTER STORY", x: 270, y: 700 },
          { text: "AN ORIGINAL SCREENPLAY", x: 270, y: 676 },
          { text: "AUGUST 2026", x: 270, y: 652 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "EXT. ORCHARD - NIGHT", x: 126, y: 700 },
          { text: "RAIN MOVES THROUGH THE TREES.", x: 126, y: 676 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 126);
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "action",
    });
  });

  it("prefers later body action over a more numerous leftward first-page origin", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "A WINTER STORY", x: 72, y: 700 },
          { text: "AN ORIGINAL SCREENPLAY", x: 72, y: 676 },
          { text: "AUGUST 2026", x: 72, y: 652 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "Rain moves through the orchard.", x: 126, y: 700 },
          { text: "A gate shifts in the wind.", x: 126, y: 676 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 126);
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "action",
    });
  });

  it("separates one contextual transition from established dialogue geometry", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "ALICE", x: 252, y: 700 },
          { text: "Wait here.", x: 180, y: 688 },
          { text: "Rain reaches the windows.", x: 108, y: 652 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "BEN", x: 252, y: 700 },
          { text: "I understand.", x: 180, y: 688 },
          { text: "The room falls quiet.", x: 108, y: 652 },
        ],
      },
      {
        pageIndex: 2,
        lines: [
          { text: "SHIFT:", x: 456.8, y: 700 },
          { text: "Morning fills the orchard.", x: 108, y: 688 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.action, 108);
    expectLeftAnchor(result.characterCue, 252);
    expectLeftAnchor(result.dialogue, 180);
    expect(result.transition).not.toBeNull();
    expect(result.transition!.alignment).toBe("right");
    expect(Math.abs(result.transition!.x - 500)).toBeLessThanOrEqual(0.1);

    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "action",
    });
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "character-cue",
    });
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "dialogue",
    });
    expect(result.diagnostics).not.toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "transition",
    });
  });

  it("keeps lowercase opaque character extensions eligible for cue geometry", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "EDWARD (cont’d)", x: 252, y: 700 },
          { text: "No.", x: 180, y: 688 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expectLeftAnchor(result.characterCue, 252);
    expectLeftAnchor(result.dialogue, 180);
    expect(result.transition).toBeNull();
  });

  it("does not fabricate a parenthetical left origin from stable centered text", () => {
    const normalizedText = createNormalizedText([
      {
        pageIndex: 0,
        lines: [
          { text: "ALICE", x: 252, y: 700 },
          { text: "(quietly)", x: 237.6, y: 688 },
          { text: "Wait here.", x: 180, y: 676 },
        ],
      },
      {
        pageIndex: 1,
        lines: [
          { text: "BEN", x: 252, y: 700 },
          { text: "(quietly)", x: 237.6, y: 688 },
          { text: "I understand.", x: 180, y: 676 },
        ],
      },
      {
        pageIndex: 2,
        lines: [
          { text: "CARA", x: 252, y: 700 },
          { text: "(quietly)", x: 237.6, y: 688 },
          { text: "Then stay close.", x: 180, y: 676 },
        ],
      },
      {
        pageIndex: 3,
        lines: [
          { text: "DAVID", x: 252, y: 700 },
          { text: "(with concern)", x: 219.6, y: 688 },
          { text: "The road is empty.", x: 180, y: 676 },
        ],
      },
      {
        pageIndex: 4,
        lines: [
          { text: "ELENA", x: 252, y: 700 },
          { text: "(after a measured pause)", x: 183.6, y: 688 },
          { text: "We should leave.", x: 180, y: 676 },
        ],
      },
    ]);

    const result = inferScreenplayLayout(normalizedText);

    expect(result.parenthetical).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "parenthetical",
    });
  });
});
