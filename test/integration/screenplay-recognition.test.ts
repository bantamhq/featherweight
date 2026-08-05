import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { inferScreenplayLayout } from "../../src/core/layout/infer-screenplay-layout.js";
import { groupPositionedTextIntoPhysicalLines } from "../../src/core/physical-lines.js";
import { recognizeScreenplay } from "../../src/core/recognition/recognize-screenplay.js";
import { extractPositionedPdfText } from "../../src/pdf/extraction/pdf-inspector.js";
import { normalizePhysicalText } from "../../src/pdf/normalization/physical-text.js";
import { brickAndSteelDocument } from "../fixtures/semantic/brick-and-steel-document.js";
import { normalizationGauntletDocument } from "../fixtures/semantic/normalization-gauntlet-document.js";

const brickAndSteelPdfUrl = new URL("../brick-and-steel.pdf", import.meta.url);
const gauntletPdfUrls = [
  new URL("../normalization-gauntlet-clean.pdf", import.meta.url),
  new URL("../normalization-gauntlet-artifacts.pdf", import.meta.url),
];

function recognizePdf(pdfUrl: URL) {
  const positionedText = extractPositionedPdfText(readFileSync(pdfUrl));
  const physicalText = groupPositionedTextIntoPhysicalLines(positionedText);
  const normalizedText = normalizePhysicalText(physicalText);
  const layout = inferScreenplayLayout(normalizedText);

  return recognizeScreenplay(normalizedText, layout);
}

describe("recognizeScreenplay", () => {
  it("recovers the same complete screenplay from clean and artifact-marked gauntlet PDFs", () => {
    const results = gauntletPdfUrls.map(recognizePdf);

    expect(results).toEqual([
      normalizationGauntletDocument,
      normalizationGauntletDocument,
    ]);
  });

  it("recovers the complete Brick & Steel screenplay document", () => {
    expect(recognizePdf(brickAndSteelPdfUrl)).toEqual(brickAndSteelDocument);
  });
});
