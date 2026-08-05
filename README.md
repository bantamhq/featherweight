# Featherweight

PDF-to-screenplay semantic conversion for Node.js.

## Command-line usage

The `featherweight` command converts one local PDF using only its native
embedded text. Fountain is written to stdout by default.

```sh
featherweight screenplay.pdf
featherweight screenplay.pdf --format fountain
featherweight screenplay.pdf --format json
featherweight screenplay.pdf --output screenplay.fountain
featherweight screenplay.pdf --format json --output screenplay.json
```

`--output` overwrites an existing destination. The input and output must not
resolve to the same absolute path, and the output's parent directory must
already exist. The output format is selected only by `--format`, not by the
destination's extension. Successful file output writes nothing to stdout or
stderr.

This command does not inspect pages or perform OCR. A PDF with no embedded text
successfully produces empty Fountain or an empty screenplay JSON document,
without an OCR warning. The command does not accept stdin, short options, or
FDX output.

Use `featherweight --help` for supported syntax and `featherweight --version`
for the installed package version. Invalid arguments exit with status 2.
Input, extraction, conversion, and output failures exit with status 1 and a
concise diagnostic on stderr. Successful commands exit with status 0.

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
