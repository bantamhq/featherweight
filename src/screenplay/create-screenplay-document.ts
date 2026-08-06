import { inferScreenplayLayout } from "../core/layout/infer-screenplay-layout.js";
import { groupPositionedTextIntoPhysicalLines } from "../core/physical-lines.js";
import type {
  PositionedText,
  PositionedTextItem,
  SourceMethod,
} from "../core/positioned-text.js";
import { recognizeScreenplay } from "../core/recognition/recognize-screenplay.js";
import type { ScreenplayDocument } from "../core/screenplay-document.js";
import { normalizePhysicalText } from "../pdf/normalization/physical-text.js";
import type { PositionedTextPage } from "./positioned-text-page.js";

interface SourcedPage extends PositionedTextPage {
  readonly sourceMethod: SourceMethod;
}

export function createScreenplayDocument(
  nativePages: readonly PositionedTextPage[],
  ocrPages: readonly PositionedTextPage[],
): ScreenplayDocument {
  const pages = [
    ...withSourceMethod(nativePages, "embedded-text"),
    ...withSourceMethod(ocrPages, "ocr"),
  ].sort((left, right) => left.pageIndex - right.pageIndex);
  const positionedText = assemblePositionedText(pages);
  const physicalText = groupPositionedTextIntoPhysicalLines(positionedText);
  const normalizedText = normalizePhysicalText(
    physicalText,
    pages.map((page) => page.pageIndex),
  );
  const layout = inferScreenplayLayout(normalizedText);

  return recognizeScreenplay(normalizedText, layout);
}

function withSourceMethod(
  pages: readonly PositionedTextPage[],
  sourceMethod: SourceMethod,
): readonly SourcedPage[] {
  return pages.map((page) => ({ ...page, sourceMethod }));
}

function assemblePositionedText(
  pages: readonly SourcedPage[],
): PositionedText {
  let sourceIndex = 0;
  const positionedItems: PositionedTextItem[] = [];

  for (const page of pages) {
    for (const item of page.items) {
      positionedItems.push({
        sourceIndex,
        sourceMethod: page.sourceMethod,
        pageIndex: page.pageIndex,
        text: item.text,
        bounds: { ...item.bounds },
        font: { ...item.font },
        style: { ...item.style },
      });
      sourceIndex += 1;
    }
  }

  return { items: positionedItems };
}
