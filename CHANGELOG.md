# Changelog

All notable changes to Featherweight are documented in this file.

## 0.1.2 - 2026-08-06

- Preserve adjacent inset action lines as newline-delimited blocks.
- Detect scene numbers printed on the left, right, or both sides of scene
  headings, including numbered nonstandard headings.

## 0.1.1 - 2026-08-05

- Correct the public conversion API to accept PDF bytes and native/OCR page
  routes while keeping positioned-text processing internal.

## 0.1.0 - 2026-08-05

First public release.

- Inspect PDFs for physical page count and pages without usable embedded text.
- Recover canonical screenplay documents from caller-routed positioned text.
- Recognize title pages, scene headings, action, dialogue, dual dialogue,
  parentheticals, lyrics, transitions, centered text, inline styling, and page
  boundaries.
- Serialize screenplay documents as JSON, Fountain, and FDX.
- Convert native-text PDFs from the `featherweight` command line.
