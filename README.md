# Featherweight

PDF-to-screenplay semantic conversion for Node.js.

## Screenplay conversion

Featherweight converts caller-routed native and OCR positioned pages into
canonical screenplay JSON or Fountain. Both conversions are synchronous and do
not mutate their inputs.

```ts
import {
  inspectScreenplayPdf,
  screenplayToFountain,
  screenplayToJSON,
  type PositionedTextPage,
} from "@bantam-hq/featherweight";

const inspection = inspectScreenplayPdf(pdfBytes);
const nativePages: PositionedTextPage[] = [
  {
    pageIndex: 0,
    items: [
      {
        text: "EXAMPLE",
        bounds: { x: 252, y: 700, width: 50.4, height: 12 },
        font: { name: "Courier Prime", size: 12 },
        style: {
          bold: true,
          italic: false,
          underline: false,
          strikeout: false,
        },
      },
    ],
  },
];
const ocrPages: PositionedTextPage[] = [
  {
    pageIndex: 1,
    items: [
      {
        text: "OCR-supplied Action.",
        bounds: { x: 108, y: 700, width: 144, height: 12 },
        font: { name: "Courier Prime", size: 12 },
        style: {
          bold: false,
          italic: false,
          underline: false,
          strikeout: false,
        },
      },
    ],
  },
];

if (inspection.pagesNeedingOcr.includes(1)) {
  const json = screenplayToJSON(nativePages, ocrPages);
  const fountain = screenplayToFountain(nativePages, ocrPages);
}
```

Callers own native/OCR routing and supply each physical page at most once.
`pageIndex` is zero-based, page-array order is irrelevant, and item order within
a page is authoritative. Missing page indexes and explicitly empty pages are
supported: available content is returned without joining Action or dialogue
across an unavailable page. Only physical page 0 is eligible for separate title
page recognition.

JSON output uses two-space indentation and exactly one final line feed. Fountain
output uses the same recognized screenplay document and the package's canonical
Fountain serialization.
