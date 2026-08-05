# Featherweight

PDF-to-screenplay semantic conversion for Node.js.

## Fountain serialization

`screenplayToFountain` converts an existing semantic `ScreenplayDocument` into
canonical Fountain without mutating the document.

```ts
import {
  screenplayToFountain,
  type ScreenplayDocument,
} from "@bantam-hq/featherweight";

const document: ScreenplayDocument = {
  titlePage: [
    {
      key: "Title",
      values: [{ runs: [{ text: "Example", styles: [] }] }],
    },
  ],
  elements: [],
};

const fountain = screenplayToFountain(document);
```

The serializer is pure and synchronous. It accepts a semantic document directly;
PDF-to-document orchestration and command-line conversion are outside this API.
