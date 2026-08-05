import { describe, expect, it } from "vitest";

import type { PositionedText } from "../../../src/core/positioned-text.js";
import type { PositionedTextPage } from "../../../src/screenplay/positioned-text-page.js";
import { positionedTextToPages } from "../../../src/screenplay/positioned-text-pages.js";

describe("positionedTextToPages", () => {
  it("groups items by page while preserving caller-visible item evidence and order", () => {
    const positionedText: PositionedText = {
      items: [
        item(8, 2, "page two first", 18, true),
        item(3, 0, "page zero", 11, false),
        item(5, 2, "page two second", 24, false),
      ],
    };
    const pages = positionedTextToPages(positionedText);
    const pageZero = pages.find(
      (page: PositionedTextPage) => page.pageIndex === 0,
    );
    const pageTwo = pages.find(
      (page: PositionedTextPage) => page.pageIndex === 2,
    );

    expect(pages).toHaveLength(2);
    expect(pageZero).toBeDefined();
    expect(pageZero!.items).toHaveLength(1);
    expect(pageZero!.items[0]).toMatchObject({
      text: "page zero",
      bounds: { x: 3, y: 6, width: 9, height: 12 },
      font: { name: "Courier Prime 3", size: 11 },
      style: {
        bold: false,
        italic: true,
        underline: false,
        strikeout: false,
      },
    });
    expect(pageTwo).toBeDefined();
    expect(pageTwo!.items).toHaveLength(2);
    expect(pageTwo!.items[0]).toMatchObject({
      text: "page two first",
      bounds: { x: 8, y: 16, width: 24, height: 32 },
      font: { name: "Courier Prime 8", size: 18 },
      style: {
        bold: true,
        italic: false,
        underline: true,
        strikeout: false,
      },
    });
    expect(pageTwo!.items[1]).toMatchObject({
      text: "page two second",
      bounds: { x: 5, y: 10, width: 15, height: 20 },
      font: { name: "Courier Prime 5", size: 24 },
      style: {
        bold: false,
        italic: true,
        underline: false,
        strikeout: true,
      },
    });
  });
});

function item(
  sourceIndex: number,
  pageIndex: number,
  text: string,
  fontSize: number,
  emphasized: boolean,
): PositionedText["items"][number] {
  return {
    sourceIndex,
    sourceMethod: "embedded-text",
    pageIndex,
    text,
    bounds: {
      x: sourceIndex,
      y: sourceIndex * 2,
      width: sourceIndex * 3,
      height: sourceIndex * 4,
    },
    font: { name: `Courier Prime ${sourceIndex}`, size: fontSize },
    style: {
      bold: emphasized,
      italic: !emphasized,
      underline: emphasized,
      strikeout: sourceIndex === 5,
    },
  };
}
