# Featherweight

Turn a screenplay PDF into Fountain, FDX, or structured JSON.

Featherweight reads the text, styling, and layout already in a PDF and puts the
screenplay back together. It knows the difference between a scene heading and
action, a character cue and dialogue, or a centered title and a transition.
The result is an editable screenplay—not a pile of lines copied out of a PDF.

## Features

- **Fast** — converts a 120-page feature screenplay into an editable file in an
  average of 177 ms, with no model or external service.
- **Screenplay-aware** — recognizes title pages, scene headings, action,
  characters, parentheticals, dialogue, dual dialogue, lyrics, transitions,
  centered text, and page breaks.
- **Keeps the writing intact** — preserves inline emphasis, scene numbers,
  character extensions, deliberate spacing, and source ordering.
- **Three useful outputs** — clean Fountain, ready-to-open FDX, or canonical
  JSON for your own application.
- **Flexible page routing** — choose native extraction or reserve a page for
  OCR through the same conversion API.
- **Works where you do** — ESM and TypeScript types for Node.js, plus a small
  command-line tool.

## Install

Featherweight requires Node.js 24 or newer.

```sh
npm install @bantam-hq/featherweight
```

For the command-line tool:

```sh
npm install --global @bantam-hq/featherweight
```

## Command line

Point Featherweight at a PDF. Fountain goes to stdout by default.

```sh
featherweight screenplay.pdf
```

Choose another format or write straight to a file:

```sh
featherweight screenplay.pdf --output screenplay.fountain
featherweight screenplay.pdf --format json --output screenplay.json
featherweight screenplay.pdf --format fdx --output screenplay.fdx
```

```text
Usage: featherweight <input.pdf> [--format fountain|json|fdx] [--output <path>]
```

The format comes from `--format`, not the output filename. An existing output
file is replaced, and its parent directory must already exist. Run
`featherweight --help` for help or `featherweight --version` for the installed
version.

## Node.js API

The API has two jobs: inspect the PDF, then turn it into the format you want.

### Inspect a PDF

```ts
import { readFile } from "node:fs/promises";
import { inspectScreenplayPdf } from "@bantam-hq/featherweight";

const pdfBytes = new Uint8Array(await readFile("screenplay.pdf"));
const inspection = inspectScreenplayPdf(pdfBytes);

console.log(inspection.pageCount);
console.log(inspection.pagesNeedingOcr);
```

```ts
function inspectScreenplayPdf(pdfBytes: Uint8Array): PdfInspection;

interface PdfInspection {
  readonly pageCount: number;
  readonly pagesNeedingOcr: readonly number[];
}
```

Page indexes are zero-based.

### Convert a screenplay

Pass the original PDF and choose which pages should use native text extraction
and which should be reserved for OCR. Featherweight handles extraction,
screenplay recognition, and serialization behind the public API.

```ts
import { readFile } from "node:fs/promises";
import {
  inspectScreenplayPdf,
  screenplayToFDX,
  screenplayToFountain,
  screenplayToJSON,
} from "@bantam-hq/featherweight";

const pdfBytes = new Uint8Array(await readFile("screenplay.pdf"));
const inspection = inspectScreenplayPdf(pdfBytes);
const nativePageIndexes = Array.from(
  { length: inspection.pageCount },
  (_, pageIndex) => pageIndex,
);

const fountain = screenplayToFountain(pdfBytes, nativePageIndexes, []);
const json = screenplayToJSON(pdfBytes, nativePageIndexes, []);
const fdx = screenplayToFDX(pdfBytes, nativePageIndexes, []);
```

```ts
function screenplayToJSON(
  pdfBytes: Uint8Array,
  nativePageIndexes: readonly number[],
  ocrPageIndexes: readonly number[],
): string;

function screenplayToFountain(
  pdfBytes: Uint8Array,
  nativePageIndexes: readonly number[],
  ocrPageIndexes: readonly number[],
): string;

function screenplayToFDX(
  pdfBytes: Uint8Array,
  nativePageIndexes: readonly number[],
  ocrPageIndexes: readonly number[],
): string;
```

Page indexes are zero-based. Each index belongs in one routing array at most,
and the arrays can arrive in any order. Pages routed to native extraction are
read directly from the PDF. OCR-routed pages currently preserve their physical
place without contributing text; an OCR service adapter will fill that route in
a later release. Featherweight never mutates the PDF bytes or routing arrays.

Only physical page 0 is treated as a possible title page. Every title field is
optional.

## Outputs

### Fountain

Plain-text Fountain that keeps the screenplay editable and portable.
Featherweight adds syntax only where Fountain needs it to preserve the
recognized screenplay.

### FDX

A valid Final Draft document with the screenplay's complete text, title
information, element structure, styles, scene numbers, dual dialogue, and page
breaks.

### JSON

The canonical screenplay document for applications that want the structure
directly. It includes title fields, semantic elements, styled text runs, scene
numbers, alignment, dual-dialogue ownership, and page breaks.

## Errors

PDF inspection throws `PdfInspectionError`. Screenplay conversion throws
`ScreenplayConversionError`. Both expose a stable `.code`:

```ts
type PdfInspectionErrorCode =
  | "PDF_BINDING_UNAVAILABLE"
  | "PDF_INSPECTION_FAILED";

type ScreenplayConversionErrorCode =
  | "INVALID_PAGE_INDEX"
  | "DUPLICATE_PAGE_INDEX"
  | "OVERLAPPING_PAGE_INDEX"
  | "PDF_PROCESSING_FAILED"
  | "INVALID_FDX_TEXT";
```

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs type checking, the full unit and integration suite, a
production build, and packaged CLI tests. CI runs it on Linux, macOS, and
Windows.

## Acknowledgements

Featherweight builds on and learned from some excellent open-source work:

- [PDF Inspector](https://github.com/firecrawl/pdf-inspector) by
  [Firecrawl](https://firecrawl.dev) powers fast native PDF classification and
  text extraction.
- [Fountain](https://fountain.io), created by John August, Stu Maschwitz, and
  Nima Yousefi, defines the plain-text screenplay format. Stu and John also created a number of fountain docs used for testing.
- [Screenplain](https://github.com/vilcans/screenplain) by Martin Vilcans was a
  useful reference for simple FDX output.

Licenses and fixture attribution are in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

[MIT](./LICENSE) © 2026 Bantam HQ
