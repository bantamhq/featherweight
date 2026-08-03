import { describe, expect, it } from "vitest";

import { PdfExtractionError } from "../../../../src/pdf/extraction/errors.js";
import { translatePdfInspectorTextItems } from "../../../../src/pdf/extraction/pdf-inspector.js";

const sceneHeading = {
  text: "EXT. BRICK'S PATIO - DAY",
  x: 72.125,
  y: 84.5,
  width: 181.75,
  height: 12.25,
  font: "CourierPrime-Bold",
  fontSize: 12,
  page: 2,
  isBold: true,
  isItalic: false,
  isUnderline: false,
  isStrikeout: false,
  itemType: "Text",
} as const;

const parenthetical = {
  text: "(beer raised)",
  x: 252.5,
  y: 276.25,
  width: 86.625,
  height: 11.5,
  font: "CourierPrime-Regular",
  fontSize: 11.875,
  page: 2,
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isStrikeout: true,
  itemType: "Text",
} as const;

const emphasizedAction = {
  text: "Leupold Mark 4",
  x: 226.75,
  y: 432.125,
  width: 103.5,
  height: 12.75,
  font: "CourierPrime-Italic",
  fontSize: 12.25,
  page: 3,
  isBold: false,
  isItalic: true,
  isUnderline: true,
  isStrikeout: false,
  itemType: "Text",
} as const;

describe("translatePdfInspectorTextItems", () => {
  it("preserves screenplay text fields while excluding non-text items", () => {
    const result = translatePdfInspectorTextItems([
      sceneHeading,
      { itemType: "Image" },
      parenthetical,
      emphasizedAction,
    ]);

    expect(result).toEqual({
      items: [
        {
          sourceIndex: 0,
          sourceMethod: "embedded-text",
          pageIndex: 1,
          text: "EXT. BRICK'S PATIO - DAY",
          bounds: {
            x: 72.125,
            y: 84.5,
            width: 181.75,
            height: 12.25,
          },
          font: { name: "CourierPrime-Bold", size: 12 },
          style: {
            bold: true,
            italic: false,
            underline: false,
            strikeout: false,
          },
        },
        {
          sourceIndex: 2,
          sourceMethod: "embedded-text",
          pageIndex: 1,
          text: "(beer raised)",
          bounds: {
            x: 252.5,
            y: 276.25,
            width: 86.625,
            height: 11.5,
          },
          font: { name: "CourierPrime-Regular", size: 11.875 },
          style: {
            bold: false,
            italic: false,
            underline: false,
            strikeout: true,
          },
        },
        {
          sourceIndex: 3,
          sourceMethod: "embedded-text",
          pageIndex: 2,
          text: "Leupold Mark 4",
          bounds: {
            x: 226.75,
            y: 432.125,
            width: 103.5,
            height: 12.75,
          },
          font: { name: "CourierPrime-Italic", size: 12.25 },
          style: {
            bold: false,
            italic: true,
            underline: true,
            strikeout: false,
          },
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([
    ["page below one", { page: 0 }],
    ["fractional page", { page: 1.5 }],
    ["non-finite x", { x: Number.NaN }],
    ["non-finite y", { y: Number.POSITIVE_INFINITY }],
    ["non-finite width", { width: Number.NEGATIVE_INFINITY }],
    ["non-finite height", { height: Number.NaN }],
    ["non-finite font size", { fontSize: Number.POSITIVE_INFINITY }],
  ])("rejects screenplay text with %s atomically", (_name, invalidFields) => {
    let thrown: unknown;

    try {
      translatePdfInspectorTextItems([
        sceneHeading,
        { ...parenthetical, ...invalidFields },
        emphasizedAction,
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PdfExtractionError);
    expect(thrown).toMatchObject({
      code: "PDF_ITEM_TRANSLATION_FAILED",
      message: "PDF item translation failed.",
      cause: expect.any(Error),
    });
  });
});
