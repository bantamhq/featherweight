import { describe, expect, it } from "vitest";

import { screenplayDocumentToFountain } from "../../../src/fountain/screenplay-document-to-fountain.js";
import { createScreenplayDocument } from "../../../src/screenplay/create-screenplay-document.js";
import type {
  PositionedTextPage,
  PositionedTextPageItem,
  PositionedTextStyle,
} from "../../../src/screenplay/positioned-text-page.js";

const plainStyle: PositionedTextStyle = {
  bold: false,
  italic: false,
  underline: false,
  strikeout: false,
};

function screenplayToJSON(
  nativePages: readonly PositionedTextPage[],
  ocrPages: readonly PositionedTextPage[],
): string {
  return `${JSON.stringify(
    createScreenplayDocument(nativePages, ocrPages),
    null,
    2,
  )}\n`;
}

function screenplayToFountain(
  nativePages: readonly PositionedTextPage[],
  ocrPages: readonly PositionedTextPage[],
): string {
  return screenplayDocumentToFountain(
    createScreenplayDocument(nativePages, ocrPages),
  );
}

describe("screenplay conversion", () => {
  it("preserves a geometry-evidenced word boundary between styled source items", () => {
    const nativePages = [
      page(
        0,
        item(
          "thousand",
          171,
          387,
          { ...plainStyle, underline: true },
          56,
        ),
        item(
          "times",
          234,
          387,
          { ...plainStyle, underline: true },
          35,
        ),
      ),
    ] as const;
    const expectedJSON = JSON.stringify(
      {
        titlePage: [],
        elements: [
          action([run("thousand times", ["underline"])]),
        ],
      },
      null,
      2,
    ) + "\n";

    expect(screenplayToJSON(nativePages, [])).toBe(expectedJSON);
    expect(screenplayToFountain(nativePages, [])).toBe("_thousand times_\n");
  });

  it("uses canonical page order, stable item order, and caller-visible source routing", () => {
    const pageZero = page(
      0,
      item("First ", 108, 700),
      item("ordered", 151.2, 700, { ...plainStyle, italic: true }),
      item(".", 201.6, 700),
    );
    const pageOne = page(1, item("Second page.", 108, 700));
    const pageTwo = page(2, item("Third page.", 108, 700));
    const pageThree = page(3, item("Fourth page.", 108, 700));
    const nativePages = [pageTwo, pageZero] as const;
    const ocrPages = [pageThree, pageOne] as const;
    const expectedJSON = JSON.stringify(
      {
        titlePage: [],
        elements: [
          action([
            run("First "),
            run("ordered", ["italic"]),
            run("."),
          ]),
          action([run("Second page.")]),
          action([run("Third page.")]),
          action([run("Fourth page.")]),
        ],
      },
      null,
      2,
    ) + "\n";
    const expectedFountain =
      "First *ordered*.\n\nSecond page.\n\nThird page.\n\nFourth page.\n";

    expect(screenplayToJSON(nativePages, ocrPages)).toBe(expectedJSON);
    expect(screenplayToFountain(nativePages, ocrPages)).toBe(expectedFountain);
    expect(
      screenplayToJSON(
        [...nativePages].reverse(),
        [...ocrPages].reverse(),
      ),
    ).toBe(expectedJSON);
    expect(
      screenplayToFountain(
        [...nativePages].reverse(),
        [...ocrPages].reverse(),
      ),
    ).toBe(expectedFountain);
    expect(screenplayToJSON([pageThree, pageOne], [pageTwo, pageZero])).toBe(
      expectedJSON,
    );
    expect(screenplayToFountain([pageThree, pageOne], [pageTwo, pageZero])).toBe(
      expectedFountain,
    );
    expect(screenplayToJSON([], [pageTwo, pageZero, pageThree, pageOne])).toBe(
      expectedJSON,
    );
    expect(
      screenplayToFountain([], [pageTwo, pageZero, pageThree, pageOne]),
    ).toBe(expectedFountain);
  });

  it("treats missing and empty pages as hard recognition boundaries without inventing a later title page", () => {
    const upperActionPage = page(
      0,
      item(
        "A continuous Action line reaches the physical page edge and",
        108,
        36,
        plainStyle,
        396,
      ),
    );
    const lowerActionPage = page(
      2,
      item("continues without a paragraph break.", 108, 720, plainStyle, 252),
    );
    const expectedActionJSON = JSON.stringify(
      {
        titlePage: [],
        elements: [
          action([
            run("A continuous Action line reaches the physical page edge and"),
          ]),
          action([run("continues without a paragraph break.")]),
        ],
      },
      null,
      2,
    ) + "\n";
    const expectedActionFountain =
      "A continuous Action line reaches the physical page edge and\n\n" +
      "continues without a paragraph break.\n";
    const dialoguePages = [
      page(
        0,
        item("MARA", 252, 48),
        item("First line", 180, 36),
      ),
      page(2, item("must remain separate.", 180, 720)),
    ] as const;
    const expectedDialogueJSON = JSON.stringify(
      {
        titlePage: [],
        elements: [
          { type: "character", text: styled([run("MARA")]) },
          { type: "dialogue", text: styled([run("First line")]) },
          action([run("must remain separate.")]),
        ],
      },
      null,
      2,
    ) + "\n";
    const expectedDialogueFountain =
      "MARA\nFirst line\n\nmust remain separate.\n";
    const laterTitlePages = [
      page(
        2,
        item("PRIMARY TITLE", 252, 700, { ...plainStyle, bold: true }, 108),
        item("Prepared by", 270, 652, plainStyle, 72),
        item("Writer Name", 264, 628, plainStyle, 84),
        item("Source Material", 252, 592, plainStyle, 108),
        item("2026-08-04", 90, 300, plainStyle, 72),
        item("Production Office", 90, 276, plainStyle, 120),
      ),
      page(
        3,
        item("INT. SUPPORTED BODY - DAY", 108, 700, {
          ...plainStyle,
          bold: true,
        }),
        item("The body remains available.", 108, 676),
        item("The second body line anchors Action.", 108, 652),
      ),
    ] as const;
    const expectedLaterTitleJSON = JSON.stringify(
      {
        titlePage: [],
        elements: [
          action([run("PRIMARY TITLE", ["bold"])], "center"),
          action([run("Prepared by")], "center"),
          action([run("Writer Name")], "center"),
          action([run("Source Material")], "center"),
          action([run("2026-08-04")]),
          action([run("Production Office")]),
          {
            type: "scene-heading",
            text: styled([run("INT. SUPPORTED BODY - DAY", ["bold"])]),
            sceneNumber: null,
          },
          action([run("The body remains available.")]),
          action([run("The second body line anchors Action.")]),
        ],
      },
      null,
      2,
    ) + "\n";
    const expectedLaterTitleFountain =
      ">**PRIMARY TITLE**<\n\n" +
      ">Prepared by<\n\n" +
      ">Writer Name<\n\n" +
      ">Source Material<\n\n" +
      "2026-08-04\n\n" +
      "Production Office\n\n" +
      "INT. SUPPORTED BODY - DAY\n\n" +
      "The body remains available.\n\n" +
      "The second body line anchors Action.\n";
    const missingActionPages = [upperActionPage, lowerActionPage] as const;
    const emptyActionPages = [
      upperActionPage,
      page(1),
      lowerActionPage,
    ] as const;
    const emptyDialoguePages = [
      dialoguePages[0],
      page(1),
      dialoguePages[1],
    ] as const;

    expect(screenplayToJSON(missingActionPages, [])).toBe(
      expectedActionJSON,
    );
    expect(screenplayToFountain(missingActionPages, [])).toBe(
      expectedActionFountain,
    );
    expect(screenplayToJSON(emptyActionPages, [])).toBe(expectedActionJSON);
    expect(screenplayToFountain(emptyActionPages, [])).toBe(
      expectedActionFountain,
    );
    expect(screenplayToJSON(dialoguePages, [])).toBe(expectedDialogueJSON);
    expect(screenplayToFountain(dialoguePages, [])).toBe(
      expectedDialogueFountain,
    );
    expect(screenplayToJSON(emptyDialoguePages, [])).toBe(
      expectedDialogueJSON,
    );
    expect(screenplayToFountain(emptyDialoguePages, [])).toBe(
      expectedDialogueFountain,
    );
    expect(screenplayToJSON(laterTitlePages, [])).toBe(expectedLaterTitleJSON);
    expect(screenplayToFountain(laterTitlePages, [])).toBe(
      expectedLaterTitleFountain,
    );
  });

  it("is byte-deterministic and leaves deeply frozen mixed inputs unchanged", () => {
    const nativePages = deepFreeze([
      page(0, item("Native line.", 108, 700)),
    ] as const);
    const ocrPages = deepFreeze([
      page(1, item("OCR line.", 108, 700)),
    ] as const);
    const expectedJSON = "{\n" +
      "  \"titlePage\": [],\n" +
      "  \"elements\": [\n" +
      "    {\n" +
      "      \"type\": \"action\",\n" +
      "      \"text\": {\n" +
      "        \"runs\": [\n" +
      "          {\n" +
      "            \"text\": \"Native line.\",\n" +
      "            \"styles\": []\n" +
      "          }\n" +
      "        ]\n" +
      "      },\n" +
      "      \"alignment\": \"standard\"\n" +
      "    },\n" +
      "    {\n" +
      "      \"type\": \"action\",\n" +
      "      \"text\": {\n" +
      "        \"runs\": [\n" +
      "          {\n" +
      "            \"text\": \"OCR line.\",\n" +
      "            \"styles\": []\n" +
      "          }\n" +
      "        ]\n" +
      "      },\n" +
      "      \"alignment\": \"standard\"\n" +
      "    }\n" +
      "  ]\n" +
      "}\n";
    const expectedFountain = "Native line.\n\nOCR line.\n";

    expect([
      screenplayToJSON(nativePages, ocrPages),
      screenplayToJSON(nativePages, ocrPages),
    ]).toEqual([expectedJSON, expectedJSON]);
    expect([
      screenplayToFountain(nativePages, ocrPages),
      screenplayToFountain(nativePages, ocrPages),
    ]).toEqual([expectedFountain, expectedFountain]);
  });

  it("returns exact empty JSON and Fountain artifacts for empty inputs", () => {
    expect(screenplayToJSON([], [])).toBe(
      "{\n  \"titlePage\": [],\n  \"elements\": []\n}\n",
    );
    expect(screenplayToFountain([], [])).toBe("");
  });
});

function page(
  pageIndex: number,
  ...items: readonly PositionedTextPageItem[]
): PositionedTextPage {
  return { pageIndex, items };
}

function item(
  text: string,
  x: number,
  y: number,
  style: PositionedTextStyle = plainStyle,
  width = text.length * 7.2,
): PositionedTextPageItem {
  return {
    text,
    bounds: { x, y, width, height: 12 },
    font: { name: "Courier Prime", size: 12 },
    style,
  };
}

function run(text: string, styles: readonly string[] = []) {
  return { text, styles };
}

function styled(runs: readonly ReturnType<typeof run>[]) {
  return { runs };
}

function action(
  runs: readonly ReturnType<typeof run>[],
  alignment: "standard" | "center" = "standard",
) {
  return { type: "action", text: styled(runs), alignment };
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
